import { DEBUG_MODE } from './constants.js';
import { getIsMobile, updateIsMobile } from './globals.js';
import { addNextTimeline } from './script.js';

const MINUTES_PER_DAY = 24 * 60;

// Validation functions
export function validateMinCoverage(minCoverage) {
    const coverage = parseInt(minCoverage);
    if (isNaN(coverage)) {
        throw new Error('Minimum coverage must be a number');
    }
    if (coverage < 0 || coverage > 1440) {
        throw new Error('Minimum coverage must be between 0 and 1440 minutes');
    }
    return coverage;
}

// Timeline state management functions
export function getCurrentTimelineKey() {
    return window.timelineManager.keys[window.timelineManager.currentIndex];
}

// Export to both module and window
export function getCurrentTimelineData() {
    const currentKey = getCurrentTimelineKey();
    return window.timelineManager.activities[currentKey] || [];
}

// Make functions available globally
window.getCurrentTimelineData = getCurrentTimelineData;
window.getTimelineCoverage = getTimelineCoverage;

// Function to scroll to active timeline
export function scrollToActiveTimeline() {
    const activeTimeline = window.timelineManager.activeTimeline;
    if (!activeTimeline) return;

    const isMobile = window.innerWidth <= 1440;
    if (isMobile) {
        activeTimeline.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// UI Functions
function createTimeLabel(block, showImmediately = false) {
    // Check if we're in vertical mode by looking at window width
    const isVerticalMode = window.innerWidth <= 1440;
    
    if (isVerticalMode) {
        // Create activity text container
        const textContainer = document.createElement('div');
        textContainer.className = 'activity-text';
        textContainer.textContent = block.dataset.activityName;
        block.appendChild(textContainer);
        
        // Create time label (hidden by default in vertical mode unless showImmediately is true)
        const label = document.createElement('div');
        label.className = 'time-label';
        label.style.display = showImmediately ? 'block' : 'none';
        block.appendChild(label);
        
        return label;
    } else {
        // Horizontal mode - original implementation
        const label = document.createElement('div');
        label.className = 'time-label';
        label.style.position = 'absolute';
        label.style.left = '50%';
        label.style.transform = 'translateX(-50%)';
        label.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        label.style.color = '#fff';
        label.style.padding = '2px 4px';
        label.style.borderRadius = '4px';
        label.style.fontSize = '10px';
        label.style.whiteSpace = 'nowrap';
        label.style.pointerEvents = 'none';
        label.style.zIndex = '10';
        
        label.style.bottom = '-20px';
        label.style.top = 'auto';
        
        block.appendChild(label);
        
        // Only look for labels within the active timeline
        const existingLabels = block.parentElement.querySelectorAll('.time-label');
        existingLabels.forEach(existingLabel => {
            if (existingLabel !== label && isOverlapping(existingLabel, label)) {
                label.style.bottom = 'auto';
                label.style.top = '-20px';
            }
        });

        return label;
    }
}

function updateTimeLabel(label, startTime, endTime) {
    const isVerticalMode = window.innerWidth <= 1440;
    
    label.textContent = `${startTime} - ${endTime}`;
    
    if (isVerticalMode) {
        // Show the label when updating in vertical mode
        label.style.display = 'block';
    } else {
        // Original horizontal mode behavior
        label.style.bottom = '-20px';
        label.style.top = 'auto';
        
        // Only look for labels within the active timeline
        const existingLabels = label.parentElement.parentElement.querySelectorAll('.time-label');
        existingLabels.forEach(existingLabel => {
            if (existingLabel !== label && isOverlapping(existingLabel, label)) {
                label.style.bottom = 'auto';
                label.style.top = '-20px';
            }
        });
    }
}

// Function to create floating add button
export function createFloatingAddButton() {
    const button = document.createElement('button');
    button.className = 'floating-add-button';
    button.innerHTML = '+';
    button.title = 'Add Activity';
    
    const modal = createModal();
    
    button.addEventListener('click', () => {
        // Show modal with activities
        modal.style.display = 'block';
        
        // Get the current activities and render them in the modal
        const currentKey = getCurrentTimelineKey();
        const categories = window.timelineManager.metadata[currentKey].categories;
        
        // Render activities in modal
        renderActivities(categories, document.getElementById('modalActivitiesContainer'));
        
        // Automatically open first category in mobile view
        if (getIsMobile()) {
            const firstCategory = modal.querySelector('.activity-category');
            if (firstCategory) {
                firstCategory.classList.add('active');
            }
        }
    });

    document.body.appendChild(button);
}

// Function to create modal
export function createModal() {
    // Create custom activity input modal
    const customActivityModal = document.createElement('div');
    customActivityModal.className = 'modal-overlay';
    customActivityModal.id = 'customActivityModal';
    customActivityModal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>Enter Custom Activity</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content">
                <input type="text" id="customActivityInput" maxlength="30" placeholder="Enter your activity (max 30 chars)">
                <div class="button-container">
                    <button id="confirmCustomActivity" class="btn save-btn">OK</button>
                </div>
            </div>
        </div>
    `;

    customActivityModal.querySelector('.modal-close').addEventListener('click', () => {
        customActivityModal.style.display = 'none';
    });

    customActivityModal.addEventListener('click', (e) => {
        if (e.target === customActivityModal) {
            customActivityModal.style.display = 'none';
        }
    });

    // Create activities modal
    const activitiesModal = document.createElement('div');
    activitiesModal.className = 'modal-overlay';
    activitiesModal.id = 'activitiesModal';
    activitiesModal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>Add Activity</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div id="modalActivitiesContainer"></div>
        </div>
    `;

    activitiesModal.querySelector('.modal-close').addEventListener('click', () => {
        activitiesModal.style.display = 'none';
    });

    activitiesModal.addEventListener('click', (e) => {
        if (e.target === activitiesModal) {
            activitiesModal.style.display = 'none';
        }
    });

    // Create confirmation modal
    const confirmationModal = document.createElement('div');
    confirmationModal.className = 'modal-overlay';
    confirmationModal.id = 'confirmationModal';
    confirmationModal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <h3>Are you sure?</h3>
                <p>You will not be able to change your responses.</p>
                <div class="button-container">
                    <button id="confirmCancel" class="btn btn-secondary">Cancel</button>
                    <button id="confirmOk" class="btn save-btn">OK</button>
                </div>
            </div>
        </div>
    `;

    confirmationModal.querySelector('#confirmCancel').addEventListener('click', () => {
        confirmationModal.style.display = 'none';
    });

    confirmationModal.querySelector('#confirmOk').addEventListener('click', () => {
        confirmationModal.style.display = 'none';
        sendData();
        document.getElementById('nextBtn').disabled = true;
    });

    document.body.appendChild(activitiesModal);
    document.body.appendChild(confirmationModal);
    document.body.appendChild(customActivityModal);
    return activitiesModal;
}

export {
    createTimeLabel,
    updateTimeLabel
};

export function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}

export function formatTimeHHMMWithDayOffset(totalMinutes) {
    // Keep track of how many days have passed:
    let dayOffset = 0;
  
    // Subtract 1440 (24*60) until totalMinutes < 1440
    while (totalMinutes >= 1440) {
      totalMinutes -= 1440;
      dayOffset++;
    }
  
    // Now totalMinutes is in [0..1439], i.e. within one day
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
  
    // Format hh and mm with leading zeros (00–23:00–59)
    const hhStr = hh.toString().padStart(2, '0');
    const mmStr = mm.toString().padStart(2, '0');
  
    let result = `${hhStr}:${mmStr}`;
  
    // If dayOffset > 0, append “(+1 day)” or “(+2 days)”
    if (dayOffset > 0) {
      result += ` (+${dayOffset} day${dayOffset > 1 ? 's' : ''})`;
    }
  
    return result;
  }
  

export function formatTimeDDMMYYYYHHMM(startTime, endTime) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    // Create base dates - everything starts on yesterday by default
    // since our timeline starts at 4:00 AM yesterday
    const startDate = new Date(yesterday);
    const endDate = new Date(yesterday);
    
    // If time is after midnight but before 4 AM, it's today
    if (startHour >= 0 && startHour < 4) {
        startDate.setDate(today.getDate());
    }
    
    if (endHour >= 0 && endHour <= 4) {
        endDate.setDate(today.getDate());
    }
    
    // Set hours and minutes
    startDate.setHours(startHour, startMin, 0);
    endDate.setHours(endHour, endMin, 0);
    
    // Format dates to YYYY-MM-DD HH:MM
    const formatDate = (d) => {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };
    
    return {
        startTime: formatDate(startDate),
        endTime: formatDate(endDate)
    };
}

export function formatTimeHHMM(minutes) {
    const roundedMinutes = Math.round(minutes);
    const h = Math.floor(roundedMinutes / 60) % 24;
    const m = roundedMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function timeToMinutes(timeStr) {
    if (typeof timeStr === 'number') {
        return Math.round(timeStr);
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

export function findNearestMarkers(minutes, isMobile = false) {
    const INCREMENT_MINUTES = 10;
    const hourMinutes = Math.floor(minutes / 60) * 60;
    const minutePart = minutes % 60;
    const lowerMarker = hourMinutes + Math.floor(minutePart / INCREMENT_MINUTES) * INCREMENT_MINUTES;
    const upperMarker = hourMinutes + Math.ceil(minutePart / INCREMENT_MINUTES) * INCREMENT_MINUTES;
    return [lowerMarker, upperMarker];
}

export function minutesToPercentage(minutes) {
    const TIMELINE_START_HOUR = 4;
    const TIMELINE_HOURS = 24;
    const MINUTES_PER_DAY = 24 * 60;
    const minutesSince4AM = (minutes - TIMELINE_START_HOUR * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return (minutesSince4AM / (TIMELINE_HOURS * 60)) * 100;
}

export function positionToMinutes(positionPercent) {
    const TIMELINE_START_HOUR = 4;
    const TIMELINE_HOURS = 24;
    const MINUTES_PER_DAY = 24 * 60;
    const MAX_PERCENT = 116.7; // 28 hours total (4AM to 8AM next day)
    
    if (positionPercent > MAX_PERCENT) {
        return null;
    }
    
    // Convert position to minutes, allowing values > 100%
    const minutesSinceStart = (positionPercent / 100) * TIMELINE_HOURS * 60;
    let totalMinutes = minutesSinceStart + (TIMELINE_START_HOUR * 60);
    
    // Don't modulo - allow minutes to exceed 1440 for next day
    return Math.round(totalMinutes);
}

export function calculateMinimumBlockWidth() {
    const INCREMENT_MINUTES = 10;
    const TIMELINE_HOURS = 24;
    return (INCREMENT_MINUTES / (TIMELINE_HOURS * 60)) * 100;
}

export function hasOverlap(startMinutes, endMinutes, excludeBlock = null) {
    const currentData = getCurrentTimelineData();
    const MINUTES_IN_DAY = 1440;
    const TIMELINE_START = 240; // 4:00 AM in minutes

    // Normalize minutes to timeline's 4:00 AM start
    function normalizeMinutes(minutes) {
        if (minutes < TIMELINE_START) {
            minutes += MINUTES_IN_DAY;
        }
        return minutes;
    }

    // Normalize the new activity times
    const normalizedStart = normalizeMinutes(startMinutes);
    const normalizedEnd = normalizeMinutes(endMinutes);

    return currentData.some(activity => {
        if (excludeBlock && activity.id === excludeBlock) return false;

        // Convert activity times to minutes since midnight
        const activityStartTime = activity.startTime.split(' ')[1];
        const activityEndTime = activity.endTime.split(' ')[1];
        const [startHour, startMin] = activityStartTime.split(':').map(Number);
        const [endHour, endMin] = activityEndTime.split(':').map(Number);
        
        const activityStartMinutes = normalizeMinutes(startHour * 60 + startMin);
        const activityEndMinutes = normalizeMinutes(endHour * 60 + endMin);

        // Check for overlap considering the normalized timeline
        const hasOverlap = (
            Math.max(normalizedStart, activityStartMinutes) < 
            Math.min(normalizedEnd, activityEndMinutes)
        );

        if (hasOverlap && DEBUG_MODE) {
            console.log('Overlap detected:', {
                new: { 
                    start: startMinutes, 
                    end: endMinutes,
                    normalizedStart,
                    normalizedEnd 
                },
                existing: { 
                    start: startHour * 60 + startMin,
                    end: endHour * 60 + endMin,
                    normalizedStart: activityStartMinutes,
                    normalizedEnd: activityEndMinutes
                },
                activity: activity.activity
            });
        }

        return hasOverlap;
    });
}

export function canPlaceActivity(newStart, newEnd, excludeId = null) {
    // Get current timeline key and activities
    const currentKey = getCurrentTimelineKey();
    const activities = window.timelineManager.activities[currentKey] || [];
    
    if (DEBUG_MODE) {
        console.log('Checking timeline:', currentKey, {
            newStart,
            newEnd,
            excludeId,
            existingActivities: activities.length
        });
    }
    
    // Check for overlaps in current timeline only
    const hasOverlap = activities.some(activity => {
        if (excludeId && activity.id === excludeId) return false;
        
        // Get raw minutes from dataset for accurate comparison
        const activityStart = parseInt(activity.startTime || activity.dataset?.startRaw || 0);
        const activityEnd = parseInt(activity.endTime || activity.dataset?.endRaw || 0);
        
        // Check if ranges overlap using proper interval comparison
        const overlaps = !(newEnd <= activityStart || newStart >= activityEnd);
        
        if (DEBUG_MODE && overlaps) {
            console.log('Overlap detected in timeline', currentKey, {
                existingActivity: activity,
                activityStart,
                activityEnd,
                newStart,
                newEnd,
                overlapCondition: `!(${newEnd} <= ${activityStart} || ${newStart} >= ${activityEnd})`
            });
        }
        return overlaps;
    });
    
    if (hasOverlap) {
        if (DEBUG_MODE) {
            console.log('Placement blocked by timeline:', currentKey);
        }
        return false;
    }
    
    if (DEBUG_MODE) {
        console.log('Placement allowed - no overlaps in current timeline');
    }
    
    return true;
}

export function isTimelineFull() {
    const currentData = getCurrentTimelineData();
    if (currentData.length === 0) return false;

    // Get the active timeline element
    const activeTimeline = window.timelineManager.activeTimeline;
    if (!activeTimeline) return false;

    const TIMELINE_START_HOUR = 4;
    const TIMELINE_HOURS = 24;
    const timelineStart = TIMELINE_START_HOUR * 60;
    const totalTimelineMinutes = TIMELINE_HOURS * 60;
    
    const timelineCoverage = new Array(totalTimelineMinutes).fill(false);

    currentData.forEach(activity => {
        // Convert raw minutes to time format
        const startMinutes = typeof activity.startTime === 'number' ? activity.startTime : timeToMinutes(activity.startTime);
        const endMinutes = typeof activity.endTime === 'number' ? activity.endTime : timeToMinutes(activity.endTime);

        let relativeStart = (startMinutes - timelineStart + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        let relativeEnd = (endMinutes - timelineStart + MINUTES_PER_DAY) % MINUTES_PER_DAY;

        if (relativeEnd <= relativeStart) {
            relativeEnd += MINUTES_PER_DAY;
        }

        for (let i = relativeStart; i < relativeEnd; i++) {
            const index = i % totalTimelineMinutes;
            timelineCoverage[index] = true;
        }
    });

    const coveredMinutes = timelineCoverage.filter(covered => covered).length;
    const coveragePercentage = (coveredMinutes / totalTimelineMinutes) * 100;

    if (DEBUG_MODE) {
        console.log(`Timeline coverage: ${coveragePercentage.toFixed(2)}%`);
    }

    return coveredMinutes === totalTimelineMinutes;
}

export function calculateTimeDifference(startTime, endTime) {
    // Special case: If both times are 4:00, return full day minutes
    if (startTime === '04:00' && endTime === '04:00') {
        return 1440; // 24 hours * 60 minutes
    }

    // Convert both times to minutes since midnight
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    // Handle special case for 04:00 to 00:00
    if (startMinutes === 240 && endMinutes === 0) { // 240 = 4:00
        return 1200; // 20 hours = 1200 minutes
    }

    // Calculate difference
    let difference = endMinutes - startMinutes;
    
    // If end time is before start time, add 24 hours worth of minutes
    if (difference <= 0) {
        difference += 1440; // 24 hours * 60 minutes
    }

    return difference;
}

export function isOverlapping(elem1, elem2) {
    const rect1 = elem1.getBoundingClientRect();
    const rect2 = elem2.getBoundingClientRect();
    return !(
        rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom
    );
}

export function getTextDivClass(length) {
    if (getIsMobile()) {
        return length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow';
    }
    return length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical';
}



// Button and UI state management functions
export function sendData() {
    // Get flattened timeline data
    const timelineData = createTimelineDataFrame();
    
    // Get all unique headers from study parameters
    const studyHeaders = Object.keys(window.timelineManager.study || {});
    
    // Combine standard headers with study parameter headers
    const headers = ['timelineKey', 'activity', 'category', 'startTime', 'endTime', ...studyHeaders];
    
    // Process timeline data to ensure activity and category are properly set
    const processedData = timelineData.map(row => {
        // Find the activity block element by ID to get the actual activity data
        const activityBlock = document.querySelector(`.activity-block[data-id="${row.id}"]`);
        if (activityBlock) {
            return {
                ...row,
                activity: activityBlock.querySelector('div').textContent || row.activity,
                category: activityBlock.dataset.category || row.category
            };
        }
        return row;
    });

    const csvContent = [
        headers.join(','),
        ...processedData.map(row => 
            headers.map(header => 
                // Wrap values in quotes and escape existing quotes
                `"${String(row[header] || '').replace(/"/g, '""')}"`
            ).join(',')
        )
    ].join('\n');

    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const today = new Date();
    const dateStr = today.toISOString().slice(0,10).replace(/-/g,'');
    link.download = `${dateStr}_timeline_activities.csv`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Data exported as CSV:', timelineData);
}

export function initButtons() {
    const cleanRowBtn = document.getElementById('cleanRowBtn');
    cleanRowBtn.addEventListener('click', () => {
        const currentKey = getCurrentTimelineKey();
        const currentData = getCurrentTimelineData();
        if (currentData.length > 0) {
            // Get the activities container of the active timeline
            const activeTimeline = window.timelineManager.activeTimeline;
            const activitiesContainer = activeTimeline.querySelector('.activities');
            
            if (activitiesContainer) {
                // Remove all activity blocks from the DOM
                while (activitiesContainer.firstChild) {
                    activitiesContainer.removeChild(activitiesContainer.firstChild);
                }
            }

            // Clear the activities data for current timeline
            window.timelineManager.activities[currentKey] = [];
            
            try {
                window.timelineManager.metadata[currentKey].validate();
            } catch (error) {
                console.error('Timeline validation failed:', error);
                alert('Timeline validation error: ' + error.message);
                return;
            }
                
            updateButtonStates();

            if (DEBUG_MODE) {
                console.log('Timeline data after clean:', window.timelineManager.activities);
            }
        }
    });

    document.getElementById('undoBtn').addEventListener('click', () => {
        const currentKey = getCurrentTimelineKey();
        const currentData = getCurrentTimelineData();
        if (currentData.length > 0) {
            if (DEBUG_MODE) {
                console.log('Before undo - timelineData:', window.timelineManager.activities);
            }

            const lastActivity = currentData.pop();
            // Update timeline manager activities and validate
            window.timelineManager.activities[currentKey] = currentData;
            try {
                window.timelineManager.metadata[currentKey].validate();
            } catch (error) {
                console.error('Timeline validation failed:', error);
                // Revert the change
                window.timelineManager.activities[currentKey] = [...currentData, lastActivity];
                const lastBlock = timeline.querySelector(`.activity-block[data-id="${lastActivity.id}"]`);
                if (lastBlock) {
                    lastBlock.classList.add('invalid');
                    setTimeout(() => lastBlock.classList.remove('invalid'), 400);
                }
                return;
            }
            
            if (DEBUG_MODE) {
                console.log('Removing activity:', lastActivity);
            }

            const timeline = window.timelineManager.activeTimeline;
            const blocks = timeline.querySelectorAll('.activity-block');
            
            if (DEBUG_MODE) {
                blocks.forEach(block => {
                    console.log('Block id:', block.dataset.id, 'Last activity id:', lastActivity.id);
                });
            }
            blocks.forEach(block => {
                if (block.dataset.id === lastActivity.id) {
                    if (DEBUG_MODE) {
                        console.log('Removing block with id:', lastActivity.id);
                    }
                    block.remove();
                }
            });

            updateButtonStates();
            
            if (DEBUG_MODE) {
                console.log('Final timelineData:', window.timelineManager.activities);
            }
        }
    });

    // Add click handler for Next button with debounce
    let nextButtonLastClick = 0;
    const NEXT_BUTTON_COOLDOWN = 2500; // 2.5 second cooldown
    
    document.getElementById('nextBtn').addEventListener('click', () => {
        const currentTime = Date.now();
        if (currentTime - nextButtonLastClick < NEXT_BUTTON_COOLDOWN) {
            console.log('Next button on cooldown');
            return;
        }
        nextButtonLastClick = currentTime;

        const isLastTimeline = window.timelineManager.currentIndex === window.timelineManager.keys.length - 1;
        
        if (isLastTimeline) {
            // On last timeline, show confirmation modal
            document.getElementById('confirmationModal').style.display = 'block';
        } else {
            // For other timelines, proceed to next timeline
            addNextTimeline();
        }
    });

    // Disable back button initially
    const backButton = document.getElementById('backBtn');
    if (backButton) {
        backButton.disabled = true;
    }
}

export function updateButtonStates() {
    const undoButton = document.getElementById('undoBtn');
    const cleanRowButton = document.getElementById('cleanRowBtn');
    const nextButton = document.getElementById('nextBtn');
    const backButton = document.getElementById('backBtn');

    // Get current timeline key and data
    const currentKey = getCurrentTimelineKey();
    const currentActivities = window.timelineManager.activities[currentKey] || [];
    
    // Enable/disable undo and clean row buttons based on whether there are activities
    const hasActivities = Array.isArray(currentActivities) && currentActivities.length > 0;
    
    if (DEBUG_MODE) {
        console.log('Checking activities state:', {
            currentKey,
            activitiesCount: currentActivities?.length,
            hasActivities
        });
    }
    
    // Safely update button states with null checks
    if (undoButton) {
        undoButton.disabled = !hasActivities;
        if (DEBUG_MODE) {
            console.log(`Undo button ${hasActivities ? 'enabled' : 'disabled'}`);
        }
    }
    
    if (cleanRowButton) {
        cleanRowButton.disabled = !hasActivities;
        if (DEBUG_MODE) {
            console.log(`Clean Row button ${hasActivities ? 'enabled' : 'disabled'}`);
        }
    }

    // Update next/back button states with null checks
    if (backButton) {
        backButton.disabled = window.timelineManager.currentIndex <= 0;
    }
    
    if (nextButton && currentKey && window.timelineManager.metadata[currentKey]) {
        const timeline = window.timelineManager.metadata[currentKey];
        const coverage = getTimelineCoverage();
        const meetsMinCoverage = coverage >= timeline.minCoverage;
        nextButton.disabled = !meetsMinCoverage;
    }

    if (DEBUG_MODE) {
        console.log('Button states updated:', {
            currentKey,
            activityCount: currentActivities.length,
            hasActivities,
            undoEnabled: undoButton ? !undoButton.disabled : 'button not found',
            cleanRowEnabled: cleanRowButton ? !cleanRowButton.disabled : 'button not found'
        });
    }
}

export function handleResize() {
    const wasVertical = getIsMobile();
    const layoutChanged = wasVertical !== updateIsMobile();
    
    if (layoutChanged) {
        // Clear the DOM and reinitialize the app
        const timelinesWrapper = document.querySelector('.timelines-wrapper');
        if (timelinesWrapper) {
            timelinesWrapper.innerHTML = '';
        }
        
        // Store current timeline data
        const currentState = {
            currentIndex: window.timelineManager.currentIndex,
            activities: { ...window.timelineManager.activities }
        };
        
        // Reset timeline manager state
        window.timelineManager.initialized.clear();
        window.timelineManager.currentIndex = -1;
        window.timelineManager.activeTimeline = null;
        
        // Reinitialize with stored data
        init().then(() => {
            // Restore activities
            window.timelineManager.activities = currentState.activities;
            
            // Advance to current timeline
            const advanceToCurrentTimeline = async () => {
                while (window.timelineManager.currentIndex < currentState.currentIndex) {
                    await addNextTimeline();
                }
            };
            
            advanceToCurrentTimeline();
        }).catch(error => {
            console.error('Failed to reinitialize after resize:', error);
        });
    }
}

export function createTimelineDataFrame() {
    // Initialize array to hold all timeline data
    const dataFrame = [];
    
    // Get all timeline keys
    const timelineKeys = window.timelineManager.keys;
    
    // Get study parameters if they exist
    const studyParams = (window.timelineManager.study && Object.keys(window.timelineManager.study).length > 0) 
        ? window.timelineManager.study 
        : {};
    
    // Iterate through each timeline
    timelineKeys.forEach(timelineKey => {
        const activities = window.timelineManager.activities[timelineKey] || [];
        
        // Add each activity to the dataframe with its timeline key
        activities.forEach(activity => {
            const row = {
                timelineKey: timelineKey,
                activity: activity.activity,
                category: activity.category,
                startTime: activity.startTime,
                endTime: activity.endTime
            };
            
            // Only add study params if they exist
            if(Object.keys(studyParams).length > 0) {
                Object.assign(row, studyParams);
            }
            
            dataFrame.push(row);
        });
    });
    
    return dataFrame;
}

// Function to calculate timeline coverage in minutes
export function getTimelineCoverage() {
    const activeTimeline = document.querySelector('.timeline[data-active="true"]');
    if (!activeTimeline) return 0;

    const activityBlocks = activeTimeline.querySelectorAll('.activity-block');
    if (!activityBlocks.length) return 0;

    // Calculate total minutes covered using data-length attributes
    let coveredMinutes = 0;
    const sortedBlocks = [...activityBlocks].sort((a, b) => 
        timeToMinutes(a.dataset.start) - timeToMinutes(b.dataset.start)
    );

    // Track the latest end time seen
    let latestEndTime = 0;

    sortedBlocks.forEach(block => {
        const startMinutes = timeToMinutes(block.dataset.start);
        const endMinutes = timeToMinutes(block.dataset.end);
        let blockLength;
        // Special case: If activity is from 4:00 to 4:00, it's a full day
        if (startMinutes === 240 && endMinutes === 240) { // 240 minutes = 4:00
            blockLength = 1440; // Full day in minutes
        } else if (startMinutes === 240 && endMinutes === 0) {
            // Special case: 04:00 to 00:00 = 20 hours = 1200 minutes
            blockLength = 1200;
        } else {
            // Calculate length using absolute difference
            blockLength = Math.abs(endMinutes - startMinutes);
            if (blockLength === 0) {
                // If start and end times are the same (but not 4:00-4:00)
                blockLength = 0;
            } else if (endMinutes < startMinutes) {
                // If end time is before start time, it spans across midnight
                blockLength = 1440 - blockLength;
            }
        }
        
        // Validate that block length is positive
        if (blockLength < 0) {
            throw new Error(`Invalid negative block length: ${blockLength} minutes. Start: ${startMinutes}, End: ${endMinutes}`);
        }
        
        // Only count non-overlapping portions
        if (startMinutes > latestEndTime) {
            coveredMinutes += blockLength;
        } else if (endMinutes > latestEndTime) {
            coveredMinutes += endMinutes - latestEndTime;
        }
        
        latestEndTime = Math.max(latestEndTime, endMinutes);
    });

    console.log(`Timeline coverage: ${coveredMinutes} minutes covered`);
    return coveredMinutes;
}

