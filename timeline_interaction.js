import { getIsMobile } from './globals.js';
import { 
    timeToMinutes,
    formatTimeHHMM,
    positionToMinutes,
    minutesToPercentage,
    canPlaceActivity,
    getCurrentTimelineData,
    getCurrentTimelineKey,
    updateTimeLabel,
    getTextDivClass
} from './utils.js';

export function handleResizeStart(event) {
    const target = event.target;
    target.classList.add('resizing');
    target.dataset.originalStart = target.dataset.start;
    target.dataset.originalEnd = target.dataset.end;
    target.dataset.originalLength = target.dataset.length;
    target.dataset.originalHeight = target.dataset.height;
}

export function handleResizeMove(event, targetTimeline) {
    const target = event.target;
    const timelineRect = targetTimeline.getBoundingClientRect();
    const isMobile = getIsMobile();

    if (!isMobile) {
        handleHorizontalResize(event, target, timelineRect);
    } else {
        handleVerticalResize(event, target, timelineRect);
    }
}

function handleHorizontalResize(event, target, timelineRect) {
    const isLeftEdge = event.edges.left;
    
    if (isLeftEdge) {
        handleLeftEdgeResize(event, target, timelineRect);
    } else {
        handleRightEdgeResize(event, target, timelineRect);
    }
}

function handleLeftEdgeResize(event, target, timelineRect) {
    const rawLeft = (event.rect.left / timelineRect.width) * 100;
    const rawStartMinutes = positionToMinutes(rawLeft);
    const endMinutes = timeToMinutes(target.dataset.end);
    
    let startMinutes = Math.round(rawStartMinutes / 10) * 10;
    
    // Normalize times for comparison
    let normalizedEnd = endMinutes < 240 ? endMinutes + 1440 : endMinutes;
    let normalizedStart = startMinutes < 240 ? startMinutes + 1440 : startMinutes;
    
    // Validate and adjust start time
    if (normalizedStart > normalizedEnd) {
        normalizedStart = normalizedEnd - 10;
        startMinutes = normalizedStart >= 1440 ? normalizedStart - 1440 : normalizedStart;
    }
    
    if (startMinutes <= 245) {
        startMinutes = 240;
    }
    
    const timeDiff = normalizedEnd - startMinutes;
    if (timeDiff < 10) {
        startMinutes = normalizedEnd - 10;
    }
    
    if (startMinutes >= 1440) {
        startMinutes -= 1440;
    }
    
    updateActivityBlock(target, startMinutes, endMinutes);
}

function handleRightEdgeResize(event, target, timelineRect) {
    const newWidth = (event.rect.width / timelineRect.width) * 100;
    const tenMinutesWidth = (10 / (24 * 60)) * 100;
    const intervals = Math.round(newWidth / tenMinutesWidth);
    const newSize = Math.max(tenMinutesWidth, Math.min(intervals * tenMinutesWidth, 100));
    
    const startMinutes = timeToMinutes(target.dataset.start);
    const endMinutes = positionToMinutes(parseFloat(target.style.left) + newSize);
    
    target.style.width = `${newSize}%`;
    updateActivityBlock(target, startMinutes, endMinutes);
}

function handleVerticalResize(event, target, timelineRect) {
    const newHeight = (event.rect.height / timelineRect.height) * 100;
    const tenMinutesHeight = (10 / (24 * 60)) * 100;
    const intervals = Math.round(newHeight / tenMinutesHeight);
    const newSize = Math.max(tenMinutesHeight, Math.min(intervals * tenMinutesHeight, 100));
    
    const startMinutes = timeToMinutes(target.dataset.start);
    const endMinutes = positionToMinutes(parseFloat(target.style.top) + newSize);
    
    target.style.height = `${newSize}%`;
    updateActivityBlock(target, startMinutes, endMinutes);
}

function updateActivityBlock(target, startMinutes, endMinutes) {
    if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
        target.classList.add('invalid');
        setTimeout(() => target.classList.remove('invalid'), 400);
        return;
    }

    const startTime = formatTimeHHMM(startMinutes);
    target.dataset.start = startTime;
    target.dataset.end = formatTimeHHMM(endMinutes);
    target.dataset.length = endMinutes - startMinutes;

    const timeLabel = target.querySelector('.time-label');
    if (timeLabel) {
        updateTimeLabel(timeLabel, startTime, target.dataset.end, target);
    }

    updateActivityData(target);
}

function updateActivityData(target) {
    const activityId = target.dataset.id;
    const currentData = getCurrentTimelineData();
    const activityIndex = currentData.findIndex(activity => activity.id === activityId);
    
    if (activityIndex !== -1) {
        const startMinutes = timeToMinutes(target.dataset.start);
        const endMinutes = timeToMinutes(target.dataset.end);
        const times = formatTimeDDMMYYYYHHMM(formatTimeHHMM(startMinutes), formatTimeHHMM(endMinutes));
        
        if (!times.startTime || !times.endTime) {
            throw new Error('Activity start time and end time must be defined');
        }
        
        currentData[activityIndex].startTime = times.startTime;
        currentData[activityIndex].endTime = times.endTime;
        currentData[activityIndex].blockLength = parseInt(target.dataset.length);
        
        validateTimelineAfterUpdate(target, currentData[activityIndex]);
    }
}

function validateTimelineAfterUpdate(target, activityData) {
    try {
        const timelineKey = target.dataset.timelineKey;
        window.timelineManager.metadata[timelineKey].validate();
    } catch (error) {
        console.error('Timeline validation failed:', error);
        revertActivityBlock(target, activityData);
    }
}

function revertActivityBlock(target, originalData) {
    target.dataset.start = target.dataset.originalStart;
    target.dataset.end = target.dataset.originalEnd;
    target.dataset.length = target.dataset.originalLength;
    
    const startMinutes = timeToMinutes(target.dataset.originalStart);
    const endMinutes = timeToMinutes(target.dataset.originalEnd);
    
    const startPercent = minutesToPercentage(startMinutes);
    const endPercent = minutesToPercentage(endMinutes);
    
    if (getIsMobile()) {
        target.style.top = `${startPercent}%`;
        target.style.height = `${endPercent - startPercent}%`;
    } else {
        target.style.left = `${startPercent}%`;
        target.style.width = `${endPercent - startPercent}%`;
    }
    
    const timeLabel = target.querySelector('.time-label');
    if (timeLabel) {
        updateTimeLabel(timeLabel, target.dataset.originalStart, target.dataset.originalEnd, target);
    }
    
    target.classList.add('invalid');
    setTimeout(() => target.classList.remove('invalid'), 400);
}

export function handleResizeEnd(event) {
    const target = event.target;
    target.classList.remove('resizing');
    
    const textDiv = target.querySelector('div[class^="activity-block-text"]');
    const timeLabel = target.querySelector('.time-label');
    
    if (timeLabel) {
        timeLabel.style.display = 'block';
    }
    
    if (textDiv) {
        const length = parseInt(target.dataset.length);
        textDiv.className = getTextDivClass(length);
    }
}
