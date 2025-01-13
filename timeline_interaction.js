import { getIsMobile } from './globals.js';
import { initBlockCreationByDrag } from './activity_creation.js';
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
    formatTimeDDMMYYYYHHMM,
    formatTimeHHMMWithDayOffset 
} from './utils.js';

const INCREMENT_MINUTES = 10;
const MINUTES_PER_DAY = 24 * 60;

export function initTimelineInteraction(timeline) {
    if (!timeline) {
        console.error('Timeline must be provided to initTimelineInteraction');
        return;
    }
    const targetTimeline = timeline;
    
    // Initialize drag creation
    initBlockCreationByDrag(targetTimeline);
    
    // Initialize interact.js resizable
    interact('.activity-block').resizable({
        edges: { left: !getIsMobile(), right: !getIsMobile(), bottom: getIsMobile() },
        modifiers: [
            interact.modifiers.restrictEdges({
                outer: '.timeline'
            }),
            interact.modifiers.restrictSize({
                min: { width: 10, height: 10 }
            })
        ],
        inertia: false,
        listeners: {
            start: handleResizeStart,
            move: (event) => handleResizeMove(event, targetTimeline),
            end: handleResizeEnd
        }
    });
}

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
    const maxPercent = 116.7;  // 28 hours is 116.7% of 24 hours
    const newSize = Math.max(tenMinutesWidth, Math.min(intervals * tenMinutesWidth, maxPercent));
    
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
    // A. Validate
    if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
        target.classList.add('invalid');
        setTimeout(() => target.classList.remove('invalid'), 400);
        
        // Revert to original position
        const originalStart = parseInt(target.dataset.startRaw);
        const originalEnd = parseInt(target.dataset.endRaw);
        const startPercent = minutesToPercentage(originalStart);
        const endPercent = minutesToPercentage(originalEnd);
        
        if (getIsMobile()) {
            target.style.top = `${startPercent}%`;
            target.style.height = `${endPercent - startPercent}%`;
        } else {
            target.style.left = `${startPercent}%`;
            target.style.width = `${endPercent - startPercent}%`;
        }
        return;
    }

    // B. Store the *raw minute values* in dataset,
    //    so your logic can read them *without* confusion.
    target.dataset.startRaw = startMinutes;  // e.g. 10
    target.dataset.endRaw = endMinutes;      // e.g. 1560
    target.dataset.length = endMinutes - startMinutes;

    // C. Format your times for UI display
    const displayedStart = formatTimeHHMMWithDayOffset(startMinutes);
    const displayedEnd = formatTimeHHMMWithDayOffset(endMinutes);

    // D. Store display strings in data-start/end for consistency
    target.dataset.start = displayedStart;
    target.dataset.end = displayedEnd;

    // E. Update the time label
    const timeLabel = target.querySelector('.time-label');
    if (timeLabel) {
        updateTimeLabel(timeLabel, displayedStart, displayedEnd, target);
    }

    // F. Update the activity data in your central store
    updateActivityData(target);
}

function updateActivityData(target) {
    const currentData = getCurrentTimelineData();
    const activityId  = target.dataset.id;
    const index       = currentData.findIndex(a => a.id === activityId);

    if (index !== -1) {
        // Read RAW numeric minutes, not the display
        const startMinutes = parseInt(target.dataset.startRaw, 10);
        const endMinutes   = parseInt(target.dataset.endRaw, 10);

        // Now, if you want a “YYYY-MM-DD HH:MM” format or something:
        // you can do:
        // const times = formatTimeDDMMYYYYHHMM(
        //    formatTimeHHMM(startMinutes),
        //    formatTimeHHMM(endMinutes)
        // );

        // Or store them directly in your data:
        currentData[index].startTime    = startMinutes;
        currentData[index].endTime      = endMinutes;
        currentData[index].blockLength  = (endMinutes - startMinutes);

        validateTimelineAfterUpdate(target, currentData[index]);
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
