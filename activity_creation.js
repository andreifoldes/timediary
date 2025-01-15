import { getIsMobile } from './globals.js';
import { 
    positionToMinutes,
    minutesToPercentage,
    formatTimeHHMM,
    formatTimeHHMMWithDayOffset,
    formatTimeDDMMYYYYHHMM,
    generateUniqueId,
    createTimeLabel,
    updateTimeLabel,
    canPlaceActivity,
    isTimelineFull,
    getCurrentTimelineData,
    getCurrentTimelineKey,
    updateButtonStates,
    getTextDivClass
} from './utils.js';

function emitActivityPlacedEvent(activityData, timeline) {
    const event = new CustomEvent('activityPlaced', {
        detail: {
            activity: activityData,
            timeline: timeline
        },
        bubbles: true
    });
    timeline.dispatchEvent(event);
}

import { DEBUG_MODE } from './constants.js';

const DRAG_THRESHOLD_PX = 5;     // If user moves less than this, treat as "click"
const SNAP_INTERVAL = 10;        // minutes
const MIN_DURATION_MINUTES = 10; // default block is 10 minutes

export function initBlockCreationByDrag(timeline) {
  if (!timeline) {
    console.error('Timeline element is null/undefined in initBlockCreationByDrag');
    return;
  }

  // 1) Listen for mouse events on the timeline
  let isMouseDown = false;
  let startX = 0, startY = 0;   // mouse coords for desktop vs. mobile
  let startPercent = 0;         // [0..100+]
  let previewBlock = null;

  if (DEBUG_MODE) {
    console.log('Initializing drag creation for timeline:', {
      timeline: timeline,
      id: timeline.id,
      classList: timeline.classList,
      parent: timeline.parentElement,
      isConnected: timeline.isConnected,
      dimensions: {
        width: timeline.offsetWidth,
        height: timeline.offsetHeight
      }
    });
  }

  if (DEBUG_MODE) console.log('Adding mousedown listener to timeline:', timeline);

  if (DEBUG_MODE) console.log('Adding mousedown listener to timeline element:', timeline.id || 'unnamed timeline');
  
  timeline.addEventListener('mousedown', (e) => {
    if (DEBUG_MODE) {
      console.log('Mouse down event detected:', {
        e: e,
        timelineId: timeline.id,
        selectedActivity: window.selectedActivity,
        targetIsBlock: !!e.target.closest('.activity-block'),
        target: e.target,
        timeline: timeline,
        timelineActive: timeline === window.timelineManager.activeTimeline,
        eventCoords: { x: e.clientX, y: e.clientY }
      });
    }

    // If no activity is selected, or we clicked an existing block, bail
    if (!window.selectedActivity || e.target.closest('.activity-block')) {
      if (DEBUG_MODE) console.log('Ignoring mousedown - no activity selected or clicked existing block');
      return;
    }

    if (DEBUG_MODE) console.log('Proceeding with block creation - all conditions met');

    isMouseDown = true;
    const rect = timeline.getBoundingClientRect();
    if (getIsMobile()) {
      startY = e.clientY - rect.top;
      startY = Math.max(0, Math.min(startY, rect.height));
      startPercent = (startY / rect.height) * 100;
      if (DEBUG_MODE) console.log('Mobile drag start:', { startY, startPercent });
    } else {
      startX = e.clientX - rect.left;
      startX = Math.max(0, Math.min(startX, rect.width));
      startPercent = (startX / rect.width) * 100;
      if (DEBUG_MODE) console.log('Desktop drag start:', { startX, startPercent });
    }

    // Create a small 'preview' block, but width/height=0 for now
    previewBlock = document.createElement('div');
    previewBlock.className = 'activity-block creating';
    previewBlock.style.opacity = '0.5';
    previewBlock.dataset.category = window.selectedActivity.category;
    if (window.selectedActivity.selections) {
      previewBlock.style.backgroundColor = window.selectedActivity.selections[0].color;
    } else {
      previewBlock.style.backgroundColor = window.selectedActivity.color;
    }

    if (getIsMobile()) {
      previewBlock.style.top = `${startPercent}%`;
      previewBlock.style.height = '0%';
      // Ensure consistent width and position in mobile mode
      previewBlock.style.left = '12.5%';
      previewBlock.style.width = '75%';
    } else {
      previewBlock.style.left = `${startPercent}%`;
      previewBlock.style.width = '0%';
      // center vertically if you want
      previewBlock.style.top = '25%';
      previewBlock.style.height = '75%';
    }
    timeline.appendChild(previewBlock);
  });

  timeline.addEventListener('mousemove', (e) => {
    if (!isMouseDown || !previewBlock) {
      if (DEBUG_MODE && isMouseDown) console.log('Mouse move ignored - no preview block');
      return;
    }
    if (DEBUG_MODE) console.log('Mouse move event:', { isMouseDown, hasPreviewBlock: !!previewBlock });

    const rect = timeline.getBoundingClientRect();
    let currentPercent;

    if (getIsMobile()) {
      let currentY = e.clientY - rect.top;
      currentY = Math.max(0, Math.min(currentY, rect.height));
      currentPercent = (currentY / rect.height) * 100;

      // If dragging downward
      if (currentPercent >= startPercent) {
        previewBlock.style.top = `${startPercent}%`;
        previewBlock.style.height = `${currentPercent - startPercent}%`;
      } else {
        // dragging upward
        previewBlock.style.top = `${currentPercent}%`;
        previewBlock.style.height = `${startPercent - currentPercent}%`;
      }
    } else {
      let currentX = e.clientX - rect.left;
      currentX = Math.max(0, Math.min(currentX, rect.width));
      currentPercent = (currentX / rect.width) * 100;

      // If dragging right
      if (currentPercent >= startPercent) {
        previewBlock.style.left = `${startPercent}%`;
        previewBlock.style.width = `${currentPercent - startPercent}%`;
      } else {
        // dragging left
        previewBlock.style.left = `${currentPercent}%`;
        previewBlock.style.width = `${startPercent - currentPercent}%`;
      }
    }
  });

  timeline.addEventListener('mouseup', (e) => {
    if (DEBUG_MODE) console.log('Mouse up event:', { isMouseDown, hasPreviewBlock: !!previewBlock });
    
    if (!isMouseDown) {
      if (DEBUG_MODE) console.log('Mouse up ignored - not dragging');
      return;
    }
    isMouseDown = false;
    
    if (!previewBlock) {
      if (DEBUG_MODE) console.log('Mouse up ignored - no preview block');
      return;
    }

    // 1) Determine how far user actually moved (in pixels)
    const rect = timeline.getBoundingClientRect();
    let endX = 0, endY = 0, dragDistancePx = 0;
    
    if (getIsMobile()) {
      endY = e.clientY - rect.top;
      dragDistancePx = Math.abs(endY - startY);
    } else {
      endX = e.clientX - rect.left;
      dragDistancePx = Math.abs(endX - startX);
    }

    // 2) If dragDistance < DRAG_THRESHOLD_PX => treat as single-click
    if (dragDistancePx < DRAG_THRESHOLD_PX) {
      // We can remove the previewBlock (width=0 anyway) and create a default 10-min block
      previewBlock.remove();
      previewBlock = null;

      createBlockAtClickPosition(timeline, startPercent);
      return;
    }

    // 3) Otherwise, finalize the custom block with start/end
    finalizeDragBlock(previewBlock, timeline);

    previewBlock = null;
  });
}

/** If the user only clicked (no drag), create a 10-min block at 'startPercent'. */
function createBlockAtClickPosition(timeline, startPercent) {
  // Convert to minutes, snap start to 10-min
  let startMins = snapToInterval(positionToMinutes(startPercent));
  let endMins = startMins + MIN_DURATION_MINUTES; // 10 minutes by default

  if (endMins > 1680) {
    endMins = 1680; 
  }

  // Create the block
  const block = document.createElement('div');
  block.className = 'activity-block';
  block.style.opacity = '1.0';
  block.dataset.startRaw = startMins;
  block.dataset.endRaw = endMins;
  block.dataset.length = endMins - startMins;

  // Create text div with proper class
  const textDiv = document.createElement('div');
  textDiv.className = getTextDivClass(endMins - startMins);
  
  // Handle multiple selections for both mobile and desktop
  if (window.selectedActivity.selections) {
    // Create split background for multiple selections
    const colors = window.selectedActivity.selections.map(s => s.color);
    const numSelections = colors.length;
    const percentage = 100 / numSelections;
    
    if (getIsMobile()) {
      // Horizontal splits for mobile
      const stops = colors.map((color, index) => 
        `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
      ).join(', ');
      block.style.background = `linear-gradient(to right, ${stops})`;
    } else {
      // Vertical splits for desktop
      const stops = colors.map((color, index) => 
        `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
      ).join(', ');
      block.style.background = `linear-gradient(to bottom, ${stops})`;
    }
    
    textDiv.innerHTML = window.selectedActivity.selections.map(s => s.name).join('<br>');
  } else {
    block.style.backgroundColor = window.selectedActivity.color;
    textDiv.textContent = window.selectedActivity.name;
  }
  
  block.appendChild(textDiv);
  
  block.dataset.start = formatTimeHHMMWithDayOffset(startMins);
  block.dataset.end = formatTimeHHMMWithDayOffset(endMins);
  block.dataset.category = window.selectedActivity.category;

  // Position it based on layout
  const startPercentValue = minutesToPercentage(startMins);
  const widthOrHeight = minutesToPercentage(endMins) - startPercentValue;

  if (getIsMobile()) {
    block.style.top = `${startPercentValue}%`;
    block.style.height = `${widthOrHeight}%`;
    block.style.left = '12.5%';  // Center horizontally
    block.style.width = '75%';   // Consistent width
  } else {
    block.style.left = `${startPercentValue}%`;
    block.style.width = `${widthOrHeight}%`;
    block.style.top = '25%';
    block.style.height = '75%';
  }

  // Add label
  const timeLabel = document.createElement('div');
  timeLabel.className = 'time-label';
  block.appendChild(timeLabel);
  
  // Get or create activities container
  let activitiesContainer = timeline.querySelector('.activities');
  if (!activitiesContainer) {
    activitiesContainer = document.createElement('div');
    activitiesContainer.className = 'activities';
    timeline.appendChild(activitiesContainer);
  }
  
  activitiesContainer.appendChild(block);
  
  // Update label after block is in DOM
  updateTimeLabel(timeLabel, block.dataset.start, block.dataset.end, block);

  // ─────────────────────────────────────────────────────────────────────
  // 1) Now create a data object and add it to timelineManager
  // ─────────────────────────────────────────────────────────────────────
  const activityData = {
    id: generateUniqueId(),
    // Might combine multiple selections or use just one
    activity: window.selectedActivity.selections
      ? window.selectedActivity.selections.map(s => s.name).join(' | ')
      : window.selectedActivity.name,
    category: block.dataset.category,
    startTime: parseInt(block.dataset.startRaw, 10),
    endTime: parseInt(block.dataset.endRaw, 10),
    blockLength: parseInt(block.dataset.length, 10),
    color: window.selectedActivity.color,
    count: window.selectedActivity.selections
      ? window.selectedActivity.selections.length
      : 1
  };
  block.dataset.id = activityData.id;

  const currentTimelineKey = getCurrentTimelineKey();
  if (!window.timelineManager.activities[currentTimelineKey]) {
    window.timelineManager.activities[currentTimelineKey] = [];
  }
  window.timelineManager.activities[currentTimelineKey].push(activityData);
  
  emitActivityPlacedEvent(activityData, timeline);

  // Update button states after adding activity
  updateButtonStates();

  // 2) Finally deselect the activity
  window.selectedActivity = null;
}

/** Finalize a custom-drag block (start%..end%). */
function finalizeDragBlock(block, timeline) {
  const rect = timeline.getBoundingClientRect();
  const isMobile = getIsMobile();

  let styleStart = parseFloat(isMobile ? block.style.top : block.style.left) || 0;
  let styleSize = parseFloat(isMobile ? block.style.height : block.style.width) || 0;

  // Convert to minutes
  let startMins = snapToInterval(positionToMinutes(styleStart));
  let endMins = snapToInterval(positionToMinutes(styleStart + styleSize));

  if (endMins < startMins) {
    endMins += 1440;
  }
  if (endMins - startMins < MIN_DURATION_MINUTES) {
    endMins = startMins + MIN_DURATION_MINUTES;
  }

  // Update the block's dataset
  block.dataset.startRaw = startMins;
  block.dataset.endRaw = endMins;
  block.dataset.length = endMins - startMins;
  block.dataset.start = formatTimeHHMMWithDayOffset(startMins);
  block.dataset.end = formatTimeHHMMWithDayOffset(endMins);

  // Create text div with proper class
  const textDiv = document.createElement('div');
  textDiv.className = getTextDivClass(endMins - startMins);
  
  // Handle multiple selections
  if (window.selectedActivity.selections) {
    const colors = window.selectedActivity.selections.map(s => s.color);
    const numSelections = colors.length;
    const percentage = 100 / numSelections;
    
    if (isMobile) {
      const stops = colors.map((color, index) => 
        `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
      ).join(', ');
      block.style.background = `linear-gradient(to right, ${stops})`;
    } else {
      const stops = colors.map((color, index) => 
        `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
      ).join(', ');
      block.style.background = `linear-gradient(to bottom, ${stops})`;
    }
    
    textDiv.innerHTML = window.selectedActivity.selections.map(s => s.name).join('<br>');
  } else {
    block.style.backgroundColor = window.selectedActivity.color;
    textDiv.textContent = window.selectedActivity.name;
  }
  
  block.appendChild(textDiv);

  // Reposition/resize according to snapped values
  const startPercent = minutesToPercentage(startMins);
  const endPercent = minutesToPercentage(endMins);
  const size = endPercent - startPercent;

  if (isMobile) {
    block.style.top = `${startPercent}%`;
    block.style.height = `${size}%`;
  } else {
    block.style.left = `${startPercent}%`;
    block.style.width = `${size}%`;
  }
  block.classList.remove('creating');
  block.style.opacity = '1.0';

  // Add label 
  const timeLabel = document.createElement('div');
  timeLabel.className = 'time-label';
  block.appendChild(timeLabel);
  
  // Get or create activities container
  let activitiesContainer = timeline.querySelector('.activities');
  if (!activitiesContainer) {
    activitiesContainer = document.createElement('div');
    activitiesContainer.className = 'activities';
    timeline.appendChild(activitiesContainer);
  }
  
  activitiesContainer.appendChild(block);
  
  // Update label after block is in DOM
  updateTimeLabel(timeLabel, block.dataset.start, block.dataset.end, block);

  // Data logic, store in timeline, etc.
  // ...
  const activityData = {
    id: generateUniqueId(),
    // Might combine multiple selections or use just one
    activity: window.selectedActivity.selections
      ? window.selectedActivity.selections.map(s => s.name).join(' | ')
      : window.selectedActivity.name,
    category: block.dataset.category,
    startTime: parseInt(block.dataset.startRaw, 10),
    endTime: parseInt(block.dataset.endRaw, 10),
    blockLength: parseInt(block.dataset.length, 10),
    color: window.selectedActivity.color,
    count: window.selectedActivity.selections
      ? window.selectedActivity.selections.length
      : 1
  };
  block.dataset.id = activityData.id;

  const currentTimelineKey = getCurrentTimelineKey();
  if (!window.timelineManager.activities[currentTimelineKey]) {
    window.timelineManager.activities[currentTimelineKey] = [];
  }
  window.timelineManager.activities[currentTimelineKey].push(activityData);
  
  emitActivityPlacedEvent(activityData, timeline);
  
  // Update button states after adding activity
  updateButtonStates();
  
  // Deselect the activity
  window.selectedActivity = null;
}

/** Snap a given minute count to the nearest 10-min increment. */
function snapToInterval(minutes) {
  const remainder = minutes % SNAP_INTERVAL;
  let snapped = remainder < SNAP_INTERVAL / 2
    ? minutes - remainder
    : minutes + (SNAP_INTERVAL - remainder);

  // If we truly want multi-day, remove the clamp or set a higher max if you only want +4h.
  // return snapped;
  
  // If we only want up to 28h (1680 minutes):
  return Math.max(0, Math.min(snapped, 1680));
}
