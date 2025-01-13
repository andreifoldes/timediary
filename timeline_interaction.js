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
    getTextDivClass,
    formatTimeDDMMYYYYHHMM
} from './utils.js';

const INCREMENT_MINUTES = 10;
const MINUTES_PER_DAY = 24 * 60;

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
    // 1. Get pointer’s X within the timeline
    const pointerX = event.clientX ?? event.pageX; 
    // If your library gives you a different property, adjust accordingly
    
    const timelineLeft = timelineRect.left;
    const timelineWidth = timelineRect.width;
    
    // 2. Convert pointerX to a % of the timeline
    let newLeftPercent = ((pointerX - timelineLeft) / timelineWidth) * 100;
    
    // 3. Snap to 10-minute increments
    const tenMinutesPercent = (10 / (24 * 60)) * 100; 
    const intervals = Math.floor(newLeftPercent / tenMinutesPercent);
    newLeftPercent = Math.max(
      0,
      Math.min(intervals * tenMinutesPercent, 100)
    );
    
    // 4. Derive new width from the old right edge
    const oldLeftPercent = parseFloat(target.style.left) || 0;
    const oldWidthPercent = parseFloat(target.style.width) || 0;
    const rightPercent = oldLeftPercent + oldWidthPercent;
    
    let newWidthPercent = rightPercent - newLeftPercent;
    if (newWidthPercent < tenMinutesPercent) {
      newWidthPercent = tenMinutesPercent;
      newLeftPercent = rightPercent - newWidthPercent;
    }
    
    // 5. Apply to element
    target.style.left = `${newLeftPercent}%`;
    target.style.width = `${newWidthPercent}%`;
    
    // 6. Convert % to minutes & update block
    const startMinutes = positionToMinutes(newLeftPercent);
    const endMinutes = positionToMinutes(rightPercent);
    updateActivityBlock(target, startMinutes, endMinutes);
  }


  function handleRightEdgeResize(event, target, timelineRect) {
    const newWidth = (event.rect.width / timelineRect.width) * 100;
    const tenMinutesWidth = (10 / (24 * 60)) * 100;
    const intervals = Math.round(newWidth / tenMinutesWidth);
    const newSize = Math.max(tenMinutesWidth, Math.min(intervals * tenMinutesWidth, 100));
    
    // Convert the start from hh:mm to total minutes (0..1440):
    const startMinutes = timeToMinutes(target.dataset.start);
  
    // Convert the right boundary from % to minutes:
    const endPercent = parseFloat(target.style.left) + newSize;
    let endMinutes = positionToMinutes(endPercent);
  
    // NEW: If you *want* to allow crossing midnight, 
    // detect if end is behind start and add 24h:
    if (endMinutes < startMinutes) {
      endMinutes += 1440;  // add 24 hours
    }
  
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
    // 1. Validate
    if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
        target.classList.add('invalid');
        setTimeout(() => target.classList.remove('invalid'), 400);
        return;
    }

    // 2. Update dataset with RAW minutes (not forced to 0..1440)
    target.dataset.startRaw = startMinutes;  // e.g. 240 for 04:00
    target.dataset.endRaw = endMinutes;      // e.g. 1680 for 04:00 next day
    target.dataset.length = endMinutes - startMinutes; // could be 1440 in that example

    // 3. Format times for display (see #2 or #3 below for the function)
    const displayedStart = formatTimeHHMMExtended(startMinutes);
    const displayedEnd   = formatTimeHHMMExtended(endMinutes);

    // 4. Store those display strings in data-start / data-end if you want
    target.dataset.start = displayedStart; // or just skip storing if you prefer
    target.dataset.end   = displayedEnd;

    // 5. Update the time label
    const timeLabel = target.querySelector('.time-label');
    if (timeLabel) {
        updateTimeLabel(timeLabel, displayedStart, displayedEnd, target);
    }

    // 6. Update the activity data in your central store
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
