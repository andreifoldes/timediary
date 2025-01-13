import { TimelineMarker } from './timeline_marker.js';
import { Timeline } from './timeline.js';
import { TimelineContainer } from './timeline_container.js';
import { 
    getCurrentTimelineData, 
    getCurrentTimelineKey, 
    createTimelineDataFrame,
    getTimelineCoverage,
    createModal,
    createFloatingAddButton,
    scrollToActiveTimeline,
    validateMinCoverage,
    formatTimeDDMMYYYYHHMM,
    formatTimeHHMM,
    timeToMinutes,
    findNearestMarkers,
    minutesToPercentage,
    positionToMinutes,
    calculateMinimumBlockWidth,
    hasOverlap,
    canPlaceActivity,
    isTimelineFull,
    isOverlapping,
    generateUniqueId,
    createTimeLabel,
    updateTimeLabel,
    sendData,
    initButtons,
    updateButtonStates,
    handleResize
} from './utils.js';

import { updateIsMobile, getIsMobile } from './globals.js';

const MINUTES_PER_DAY = 24 * 60;
const INCREMENT_MINUTES = 10;
const DEFAULT_ACTIVITY_LENGTH = 10;
const TIMELINE_START_HOUR = 4;
const TIMELINE_HOURS = 24;

const DEBUG_MODE = true; // Enable debug mode


let selectedActivity = null;

// Remove duplicate import since it's now included above
window.timelineManager = {
    metadata: {}, // Timeline metadata (former timelines object)
    activities: {}, // Timeline activities (former timelineData object)
    initialized: new Set(), // Tracks initialized timelines
    activeTimeline: document.getElementById('primary'), // Initialize with primary timeline
    keys: [], // Available timeline keys
    currentIndex: 0, // Current timeline index
    study: {} // Store URL parameters
};

// Only create and populate study parameters if URL parameters exist
const urlParams = new URLSearchParams(window.location.search);
if(urlParams.toString()) {
    for (const [key, value] of urlParams) {
        window.timelineManager.study[key] = value;
    }
}

// Function to add next timeline
async function addNextTimeline() {
    if (DEBUG_MODE) {
        console.log(`Current timeline data saved:`, window.timelineManager.activities);
    }

    // Increment timeline index
    window.timelineManager.currentIndex++;
    if (window.timelineManager.currentIndex >= window.timelineManager.keys.length && DEBUG_MODE) {
        console.log('All timelines initialized');
        return;
    }

    const nextTimelineKey = window.timelineManager.keys[window.timelineManager.currentIndex];

    try {
        // Load next timeline data
        const categories = await fetchActivities(nextTimelineKey);
        
        const isMobile = getIsMobile();
        
        // Update UI for next timeline with animation
        const nextTimeline = window.timelineManager.metadata[nextTimelineKey];
        const timelineHeader = document.querySelector('.timeline-header');
        const timelineTitle = document.querySelector('.timeline-title');
        const timelineDescription = document.querySelector('.timeline-description');
        
        // First remove any existing animation
        timelineHeader.classList.remove('flip-animation');
        
        // Force a reflow before starting new animation
        void timelineHeader.offsetWidth;
        
        // Add animation class before content change
        timelineHeader.classList.add('flip-animation');
        
        // Update content immediately
        timelineTitle.textContent = nextTimeline.name;
        timelineDescription.textContent = nextTimeline.description;
        
        // Trigger reflow to ensure animation plays
        void timelineHeader.offsetWidth;
        
        // Add animation class
        timelineHeader.classList.add('flip-animation');
        
        // Remove animation class after it finishes
        timelineHeader.addEventListener('animationend', () => {
            timelineHeader.classList.remove('flip-animation');
        }, {once: true});

        // Desktop mode - create new timeline container
        const newTimelineContainer = document.createElement('div');
        newTimelineContainer.className = 'timeline-container';
        
        // Add title element
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        titleDiv.textContent = window.timelineManager.metadata[nextTimelineKey].name;
        newTimelineContainer.appendChild(titleDiv);
        
        const newTimeline = document.createElement('div');
        newTimeline.className = 'timeline';
        newTimelineContainer.appendChild(newTimeline);
        
        // Add new timeline to active wrapper
        const activeTimelineWrapper = document.querySelector('.last-initialized-timeline-wrapper');
        activeTimelineWrapper.appendChild(newTimelineContainer);
        
        // Only update previous timeline state if we have at least 2 initialized timelines
        if (window.timelineManager.initialized.size >= 2) {
            const previousTimeline = window.timelineManager.activeTimeline;
            if (previousTimeline) {
                previousTimeline.setAttribute('data-active', 'false');
                previousTimeline.parentElement.setAttribute('data-active', 'false');
                
                // Move the previous timeline to the inactive wrapper
                const inactiveTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
                inactiveTimelinesWrapper.appendChild(previousTimeline.parentElement);
            }
        }
        
        // Initialize new timeline and container with proper IDs and mode
        newTimeline.id = nextTimelineKey;
        newTimeline.setAttribute('data-timeline-type', nextTimelineKey);
        newTimeline.setAttribute('data-active', 'true');
        newTimeline.setAttribute('data-mode', window.timelineManager.metadata[nextTimelineKey].mode);
        newTimelineContainer.setAttribute('data-active', 'true');
        
        // Create and initialize timeline container with markers
        const timelineContainer = new TimelineContainer(newTimeline);
        timelineContainer.initialize(isMobile).createMarkers(isMobile);
        newTimeline.containerInstance = timelineContainer;
        
        // Set active timeline reference
        window.timelineManager.activeTimeline = newTimeline;

        // Create activities container if it doesn't exist
        let activitiesContainer = window.timelineManager.activeTimeline.querySelector('.activities');
        if (!activitiesContainer) {
            activitiesContainer = document.createElement('div');
            activitiesContainer.className = 'activities';
            window.timelineManager.activeTimeline.appendChild(activitiesContainer);
        }


        // Initialize activities array if not exists
        window.timelineManager.activities[nextTimelineKey] = window.timelineManager.activities[nextTimelineKey] || [];

        // Scroll to active timeline in mobile view
        if (getIsMobile()) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Initialize markers for the new timeline
        initTimeline(window.timelineManager.activeTimeline);

        // Render activities for next timeline
        renderActivities(categories);
        
        // Initialize interaction for the timeline
        initTimelineInteraction(window.timelineManager.activeTimeline);

        // Reset button states
        updateButtonStates();

        // Scroll to the active timeline
        scrollToActiveTimeline();

        if (DEBUG_MODE) {
            console.log(`Switched to ${nextTimelineKey} timeline`);
            console.log('Timeline data structure:', window.timelineManager.activities);
        }

        // Update Back button state
        const backButton = document.getElementById('backBtn');
        if (backButton) {
            backButton.disabled = false;
        }

        // Update activities container data-mode
        const activitiesContainerElement = document.querySelector("#activitiesContainer");
        if (activitiesContainerElement) {
            activitiesContainerElement.setAttribute('data-mode', window.timelineManager.metadata[nextTimelineKey].mode);
        }

    } catch (error) {
        console.error(`Error switching to ${nextTimelineKey} timeline:`, error);
        throw new Error(`Failed to switch to ${nextTimelineKey} timeline: ${error.message}`);
    }
}

function updateDebugOverlay(mouseX, timelineRect) {
    if (!DEBUG_MODE) return;
    
    const overlay = document.getElementById('debugOverlay');
    if (!overlay) return;

    const relativeX = mouseX - timelineRect.left;
    const percentageX = (relativeX / timelineRect.width) * 100;
    const minutes = positionToMinutes(percentageX);
    const time = formatTimeHHMM(minutes);

    overlay.style.display = 'block';
    overlay.innerHTML = `
        Position: ${percentageX.toFixed(2)}%<br>
        Minutes: ${minutes}<br>
        Time: ${time}
    `;
}

function hideDebugOverlay() {
    if (!DEBUG_MODE) return;
    
    const overlay = document.getElementById('debugOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function logDebugInfo() {
    if (DEBUG_MODE) {
        console.log('timelineData:', timelineData);
    }
}


async function fetchActivities(key) {
    try {
        const response = await fetch('activities.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data || !data.timeline || !data.general) {
            throw new Error('Invalid JSON structure');
        }

        // Set app name in document title once
        document.title = data.general.app_name;
        
        // Validate min_coverage
        if (data.timeline[key]) {
            try {
                validateMinCoverage(data.timeline[key].min_coverage);
            } catch (error) {
                const errorMessage = `Timeline "${key}": ${error.message}`;
                document.getElementById('activitiesContainer').innerHTML = 
                    `<p style="color: red; padding: 10px; background: #ffebee; border: 1px solid #ef9a9a; border-radius: 4px;">
                        ${errorMessage}
                    </p>`;
                throw new Error(errorMessage);
            }
        }

        // Initialize timeline management structure if not already initialized
        if (Object.keys(timelineManager.metadata).length === 0) {
            // Only use timeline keys, excluding 'general'
            timelineManager.keys = Object.keys(data.timeline);
            timelineManager.keys.forEach(timelineKey => {
                if (data.timeline[timelineKey]) {
                    timelineManager.metadata[timelineKey] = new Timeline(timelineKey, data.timeline[timelineKey]);
                    timelineManager.activities[timelineKey] = [];
                }
            });
            if (DEBUG_MODE) {
                console.log('Initialized timeline structure:', timelineManager);
            }
        }

        const timeline = data.timeline[key];
        if (!timeline || !timeline.categories) {
            throw new Error(`Invalid timeline data for key: ${key}`);
        }
        
        // Mark timeline as initialized
        window.timelineManager.initialized.add(key);
        
        if (DEBUG_MODE) {
            console.log(`Loaded timeline metadata for ${key}:`, window.timelineManager.metadata[key]);
            console.log('All available timelines in activities.json:', Object.keys(data));
            console.log('Full timeline data:', data);
            console.log('Initialized timelines:', Array.from(window.timelineManager.initialized));
        }
        
        return data.timeline[key].categories;
    } catch (error) {
        console.error('Error loading activities:', error);
        throw error;
    }
}

function renderActivities(categories, container = document.getElementById('activitiesContainer')) {
    container.innerHTML = '';
    
    // Set data-mode attribute based on current timeline's mode
    const currentKey = getCurrentTimelineKey();
    if (currentKey && window.timelineManager.metadata[currentKey]) {
        container.setAttribute('data-mode', window.timelineManager.metadata[currentKey].mode);
    }

    const isMobile = getIsMobile();

    if (isMobile) {
        const accordionContainer = document.createElement('div');
        accordionContainer.className = 'activities-accordion';
        // Set data-mode attribute to match current timeline's mode
        const currentKey = getCurrentTimelineKey();
        if (currentKey && window.timelineManager.metadata[currentKey]) {
            accordionContainer.setAttribute('data-mode', window.timelineManager.metadata[currentKey].mode);
        }

        categories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'activity-category';

            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = category.name;
            categoryDiv.appendChild(categoryTitle);

            const activityButtonsDiv = document.createElement('div');
            activityButtonsDiv.className = 'activity-buttons';

            category.activities.forEach(activity => {
                const activityButton = document.createElement('button');
                const isMultipleChoice = container.getAttribute('data-mode') === 'multiple-choice';
                activityButton.className = `activity-button ${isMultipleChoice ? 'checkbox-style' : ''}`;
                activityButton.style.setProperty('--color', activity.color);
                
                if (isMultipleChoice) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'checkmark';
                    activityButton.appendChild(checkmark);
                }
                
                const textSpan = document.createElement('span');
                textSpan.className = 'activity-text';
                textSpan.textContent = activity.name;
                activityButton.appendChild(textSpan);
                activityButton.addEventListener('click', () => {
                    const activitiesContainer = document.getElementById('activitiesContainer');
                    const isMultipleChoice = activitiesContainer.getAttribute('data-mode') === 'multiple-choice';
                    const categoryButtons = activityButton.closest('.activity-category').querySelectorAll('.activity-button');
                    
                    // Check if this is the "other not listed" button
                    if (activityButton.querySelector('.activity-text').textContent.includes('other not listed (enter)')) {
                        // Show custom activity modal
                        const customActivityModal = document.getElementById('customActivityModal');
                        const customActivityInput = document.getElementById('customActivityInput');
                        customActivityInput.value = ''; // Clear previous input
                        customActivityModal.style.display = 'block';
                        
                        // Handle custom activity submission
                        const handleCustomActivity = () => {
                            const customText = customActivityInput.value.trim();
                            if (customText) {
                                if (isMultipleChoice) {
                                    activityButton.classList.add('selected');
                                    const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
                                    selectedActivity = {
                                        selections: selectedButtons.map(btn => ({
                                            name: btn === activityButton ? customText : btn.querySelector('.activity-text').textContent,
                                            color: btn.style.getPropertyValue('--color')
                                        })),
                                        category: category.name
                                    };
                                } else {
                                    categoryButtons.forEach(b => b.classList.remove('selected'));
                                    selectedActivity = {
                                        name: customText,
                                        color: activityButton.style.getPropertyValue('--color'),
                                        category: category.name
                                    };
                                    activityButton.classList.add('selected');
                                }
                                customActivityModal.style.display = 'none';
                                document.getElementById('activitiesModal').style.display = 'none';
                            }
                        };

                        // Set up event listeners for custom activity modal
                        const confirmBtn = document.getElementById('confirmCustomActivity');
                        const inputField = document.getElementById('customActivityInput');
                        
                        // Remove any existing listeners
                        const newConfirmBtn = confirmBtn.cloneNode(true);
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                        
                        // Add new listeners
                        newConfirmBtn.addEventListener('click', handleCustomActivity);
                        inputField.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') {
                                handleCustomActivity();
                            }
                        });
                        
                        return;
                    }
                    
                    if (isMultipleChoice) {
                        // Toggle selection for this button
                        activityButton.classList.toggle('selected');
            
                        // Get all selected activities in this category
                        const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
            
                        if (selectedButtons.length > 0) {
                            selectedActivity = {
                                selections: selectedButtons.map(btn => ({
                                    name: btn.textContent,
                                    color: btn.style.getPropertyValue('--color')
                                })),
                                category: category.name
                            };
                        } else {
                            selectedActivity = null;
                        }
                    } else {
                        // Single choice mode
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        selectedActivity = {
                            name: activity.name,
                            color: activity.color,
                            category: category.name
                        };
                        activityButton.classList.add('selected');
                    }
                    // Only close modal in single-choice mode
                    if (!isMultipleChoice) {
                        const modal = document.querySelector('.modal-overlay');
                        if (modal) {
                            modal.style.display = 'none';
                        }
                    }
                });
                activityButtonsDiv.appendChild(activityButton);
            });

            categoryDiv.appendChild(activityButtonsDiv);
            accordionContainer.appendChild(categoryDiv);
        });

        container.appendChild(accordionContainer);

        // Add click event listener to category titles
        const categoryTitles = accordionContainer.querySelectorAll('.activity-category h3');
        categoryTitles.forEach(title => {
            title.addEventListener('click', () => {
                const category = title.parentElement;
                category.classList.toggle('active');
            });
        });
    } else {
        categories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'activity-category';

            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = category.name;
            categoryDiv.appendChild(categoryTitle);

            const activityButtonsDiv = document.createElement('div');
            activityButtonsDiv.className = 'activity-buttons';

            category.activities.forEach(activity => {
                const activityButton = document.createElement('button');
                const isMultipleChoice = container.getAttribute('data-mode') === 'multiple-choice';
                activityButton.className = `activity-button ${isMultipleChoice ? 'checkbox-style' : ''}`;
                activityButton.style.setProperty('--color', activity.color);
                
                if (isMultipleChoice) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'checkmark';
                    activityButton.appendChild(checkmark);
                }
                
                const textSpan = document.createElement('span');
                textSpan.className = 'activity-text';
                textSpan.textContent = activity.name;
                activityButton.appendChild(textSpan);
                activityButton.addEventListener('click', () => {
                    const activitiesContainer = document.getElementById('activitiesContainer');
                    const isMultipleChoice = activitiesContainer.getAttribute('data-mode') === 'multiple-choice';
                    const categoryButtons = activityButton.closest('.activity-category').querySelectorAll('.activity-button');
                    
                    // Check if this is the "other not listed" button
                    if (activity.name.includes('other not listed (enter)')) {
                        // Show custom activity modal
                        const customActivityModal = document.getElementById('customActivityModal');
                        const customActivityInput = document.getElementById('customActivityInput');
                        customActivityInput.value = ''; // Clear previous input
                        customActivityModal.style.display = 'block';
                        customActivityInput.focus(); // Focus the input field
                        
                        // Handle custom activity submission
                        const handleCustomActivity = () => {
                            const customText = customActivityInput.value.trim();
                            if (customText) {
                                if (isMultipleChoice) {
                                    activityButton.classList.add('selected');
                                    const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
                                    selectedActivity = {
                                        selections: selectedButtons.map(btn => ({
                                            name: btn === activityButton ? customText : btn.querySelector('.activity-text').textContent,
                                            color: btn.style.getPropertyValue('--color')
                                        })),
                                        category: category.name
                                    };
                                } else {
                                    categoryButtons.forEach(b => b.classList.remove('selected'));
                                    selectedActivity = {
                                        name: customText,
                                        color: activity.color,
                                        category: category.name
                                    };
                                    activityButton.classList.add('selected');
                                }
                                customActivityModal.style.display = 'none';
                                document.getElementById('activitiesModal').style.display = 'none';
                            }
                        };

                        // Set up event listeners for custom activity modal
                        const confirmBtn = document.getElementById('confirmCustomActivity');
                        const inputField = document.getElementById('customActivityInput');
                        
                        // Remove any existing listeners
                        const newConfirmBtn = confirmBtn.cloneNode(true);
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                        
                        // Add new listeners
                        newConfirmBtn.addEventListener('click', handleCustomActivity);
                        inputField.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') {
                                handleCustomActivity();
                            }
                        });
                        
                        return;
                    }
                    
                    if (isMultipleChoice) {
                        // Toggle selection for this button
                        activityButton.classList.toggle('selected');
            
                        // Get all selected activities in this category
                        const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
            
                        if (selectedButtons.length > 0) {
                            selectedActivity = {
                                selections: selectedButtons.map(btn => ({
                                    name: btn.querySelector('.activity-text').textContent,
                                    color: btn.style.getPropertyValue('--color')
                                })),
                                category: category.name
                            };
                        } else {
                            selectedActivity = null;
                        }
                    } else {
                        // Single choice mode
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        selectedActivity = {
                            name: activity.name,
                            color: activity.color,
                            category: category.name
                        };
                        activityButton.classList.add('selected');
                    }
                });
                activityButtonsDiv.appendChild(activityButton);
            });

            categoryDiv.appendChild(activityButtonsDiv);
            container.appendChild(categoryDiv);
        });
    }
}

function initTimeline(timeline) {
    timeline.setAttribute('data-active', 'true');
    timeline.setAttribute('data-layout', getIsMobile() ? 'vertical' : 'horizontal');

    // Remove existing markers
    if (timeline.containerInstance && timeline.containerInstance.hourLabelsContainer) {
        timeline.containerInstance.hourLabelsContainer.innerHTML = '';
    }
    
    // Create and initialize timeline container
    const timelineContainer = new TimelineContainer(timeline);
    timelineContainer.initialize(getIsMobile()).createMarkers(getIsMobile());
    
    // Store the container instance and markers on the timeline element for later access
    timeline.containerInstance = timelineContainer;
    timeline.markers = timelineContainer.markers || [];

    // Add window resize handler to update marker positions
    window.addEventListener('resize', () => {
        const newIsMobile = window.innerWidth < 1440;
        timeline.setAttribute('data-layout', newIsMobile ? 'vertical' : 'horizontal');
        
        // Update dimensions on layout change
        if (newIsMobile) {
            const minHeight = '2500px';
            timeline.style.height = minHeight;
            timeline.style.width = '';
            timeline.parentElement.style.height = minHeight;
            
            // Update hour label container for mobile
            const hourLabelsContainer = timeline.querySelector('.hour-labels');
            if (hourLabelsContainer) {
                hourLabelsContainer.style.height = '100%';
                hourLabelsContainer.style.width = 'auto';
            }
        } else {
            timeline.style.height = '';
            timeline.style.width = '100%';
            timeline.parentElement.style.height = '';
            
            // Update hour label container for desktop
            const hourLabelsContainer = timeline.querySelector('.hour-labels');
            if (hourLabelsContainer) {
                hourLabelsContainer.style.width = '100%';
                hourLabelsContainer.style.height = 'auto';
            }
        }
        
        // Update all markers and their labels if they exist
        if (timeline.markers && timeline.markers.length > 0) {
            timeline.markers.forEach(marker => marker.update(newIsMobile));
        }
    });

    if (DEBUG_MODE) {
        timeline.addEventListener('mousemove', (e) => {
            const rect = timeline.getBoundingClientRect();
            updateDebugOverlay(e.clientX, rect);
        });

        timeline.addEventListener('mouseleave', () => {
            hideDebugOverlay();
        });
    }
}


function initTimelineInteraction(timeline) {
    if (!timeline) {
        console.error('Timeline must be provided to initTimelineInteraction');
        return;
    }
    const targetTimeline = timeline;
    
    // Initialize interact.js resizable
    interact('.activity-block').resizable({
        onstart: function(event) {
            // Store original values before resize
            const target = event.target;
            target.dataset.originalStart = target.dataset.start;
            target.dataset.originalEnd = target.dataset.end;
            target.dataset.originalLength = target.dataset.length;
            target.dataset.originalHeight = target.dataset.height;

        },
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
            start(event) {
                event.target.classList.add('resizing');
            },
            move(event) {
                const target = event.target;
                const timelineRect = targetTimeline.getBoundingClientRect();
                
                let newSize, startTime, startMinutes, endMinutes, newWidth;
                const isMobile = getIsMobile();
                
                if (isMobile) {
                    // Mobile: Calculate height in percentage
                    let newHeight = (event.rect.height / timelineRect.height) * 100;
                    const tenMinutesHeight = (10 / (24 * 60)) * 100;
                    const intervals = Math.round(newHeight / tenMinutesHeight);
                    newSize = intervals * tenMinutesHeight;
                    newSize = Math.max(tenMinutesHeight, Math.min(newSize, 100));
                    newWidth = newSize; // Set newWidth for time label calculations
                    
                    startTime = target.dataset.start;
                    startMinutes = timeToMinutes(startTime);
                    endMinutes = positionToMinutes(parseFloat(target.style.top) + newSize);
                } else {
                    // Desktop: Calculate width in percentage
                    const isLeftEdge = event.edges.left;

                    if (isLeftEdge) {
                        // When dragging left edge, update start time and keep end time
                        const rawLeft = parseFloat(event.rect.left) / timelineRect.width * 100;
                        const rawStartMinutes = positionToMinutes(rawLeft);
                        endMinutes = timeToMinutes(target.dataset.end);
                        
                        // Normalize times for comparison (shift times after midnight)
                        let normalizedEnd = endMinutes < 240 ? endMinutes + 1440 : endMinutes;
                        let normalizedStart = rawStartMinutes < 240 ? rawStartMinutes + 1440 : rawStartMinutes;
                        
                        // If dragging past the end time, stop at the end time minus 10 minutes
                        if (normalizedStart > normalizedEnd) {
                            normalizedStart = normalizedEnd - 10;
                        }
                        
                        // Round to nearest 10-minute interval
                        startMinutes = Math.round(normalizedStart / 10) * 10;
                        
                        // Special case for 04:00
                        if (rawStartMinutes <= 245) {
                            startMinutes = 240;
                        }
                        
                        // Ensure minimum 10-minute difference
                        const timeDiff = normalizedEnd - startMinutes;
                        if (timeDiff < 10) {
                            startMinutes = normalizedEnd - 10;
                        }
                        
                        // Normalize back to 0-1440 range
                        if (startMinutes >= 1440) {
                            startMinutes -= 1440;
                        }
                        
                        // Calculate position and width
                        const finalLeft = minutesToPercentage(startMinutes);
                        newSize = ((endMinutes - startMinutes) / (24 * 60)) * 100;
                        
                        // Update block position and size
                        target.style.left = `${finalLeft}%`;
                        target.style.width = `${newSize}%`;
                        
                        // Update start time in dataset
                        const newStartTime = formatTimeHHMM(startMinutes);
                        target.dataset.start = newStartTime;
                        
                        // Update time label immediately for left edge
                        const timeLabel = target.querySelector('.time-label');
                        if (timeLabel) {
                            updateTimeLabel(timeLabel, newStartTime, target.dataset.end, target);
                        }
                        
                        // Set newWidth for consistency
                        newWidth = newSize;
                    } else {
                        // When dragging right edge, keep start time and update end
                        newWidth = (event.rect.width / timelineRect.width) * 100;
                        const tenMinutesWidth = (10 / (24 * 60)) * 100;
                        const intervals = Math.round(newWidth / tenMinutesWidth);
                        newSize = intervals * tenMinutesWidth;
                        newSize = Math.max(tenMinutesWidth, Math.min(newSize, 100));
                        
                        startTime = target.dataset.start;
                        startMinutes = timeToMinutes(startTime);
                        endMinutes = positionToMinutes(parseFloat(target.style.left) + newSize);
                        
                        // Update width for right edge
                        target.style.width = `${newSize}%`;
                    }
                }
                
                if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
                    target.classList.add('invalid');
                    setTimeout(() => target.classList.remove('invalid'), 400);
                    return;
                }
                
                // Only update size for mobile or right edge desktop drag
                if (isMobile) {
                    target.style.height = `${newSize}%`;
                    newWidth = newSize; // For time label calculations
                }

                // Update time label
                const timeLabel = target.querySelector('.time-label');
                if (timeLabel) {
                    const startTime = target.dataset.start;
                    const startMinutes = timeToMinutes(startTime);
                    let endMinutes;
                    let newWidth = newSize; // Ensure newWidth is defined for time label calculations
                        
                    if (isMobile) {
                        endMinutes = positionToMinutes((parseFloat(target.style.top) + newWidth));
                        // If the position is at the end of timeline (100%), set to 04:00
                        if (parseFloat(target.style.top) + newWidth >= 100) {
                            endMinutes = 240; // 04:00 in minutes
                        }
                    } else {
                        endMinutes = positionToMinutes((parseFloat(target.style.left) + newWidth));
                        // If the position is at the end of timeline (100%), set to 04:00
                        if (parseFloat(target.style.left) + newWidth >= 100) {
                            endMinutes = 240; // 04:00 in minutes
                        }
                    }
                    const endTime = formatTimeHHMM(endMinutes);
                    updateTimeLabel(timeLabel, startTime, endTime, target);
                            
                    // Update the end time and length in the dataset using calculateTimeDifference
                    target.dataset.end = endTime;
                    const newLength = calculateTimeDifference(startTime, endTime);
                    target.dataset.length = newLength;
                    
                    // Update text class based on length and mode
                    const textDiv = target.querySelector('div[class^="activity-block-text"]');
                    if (textDiv) {
                        textDiv.className = getIsMobile()
                            ? (newLength >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow')
                            : (newLength >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical');
                    }
                    
                    // Update the activity data in timelineManager
                    const activityId = target.dataset.id;
                    const currentData = getCurrentTimelineData();
                    const activityIndex = currentData.findIndex(activity => activity.id === activityId);
                    
                    if (activityIndex !== -1) {
                        const times = formatTimeDDMMYYYYHHMM(formatTimeHHMM(startMinutes), formatTimeHHMM(endMinutes));
                        if (!times.startTime || !times.endTime) {
                            throw new Error('Activity start time and end time must be defined');
                        }
                        currentData[activityIndex].startTime = times.startTime;
                        currentData[activityIndex].endTime = times.endTime;
                        currentData[activityIndex].blockLength = parseInt(target.dataset.length);
                        
                        // Validate timeline after resizing activity
                        try {
                            const timelineKey = event.target.dataset.timelineKey;
                            window.timelineManager.metadata[timelineKey].validate();
                        } catch (error) {
                            console.error('Timeline validation failed:', error);
                            // Revert the change
                            const originalTimes = formatTimeDDMMYYYYHHMM(target.dataset.originalStart, target.dataset.originalEnd);
                            currentData[activityIndex].startTime = originalTimes.startTime;
                            currentData[activityIndex].endTime = originalTimes.endTime;
                            currentData[activityIndex].blockLength = parseInt(target.dataset.originalLength);
                            const block = document.createElement('div');
                            block.className = 'activity-block invalid';
                            block.style.backgroundColor = currentBlock.style.backgroundColor;
                            block.style.width = currentBlock.style.width;
                            block.style.height = currentBlock.style.height;
                            block.style.top = currentBlock.style.top;
                            block.style.left = currentBlock.style.left;
                            targetTimeline.appendChild(block);
                            setTimeout(() => block.remove(), 400);
                            return;
                        }

                        if (DEBUG_MODE) {
                            console.log('Updated activity data:', currentData[activityIndex]);
                        }
                    }
                }
            },
            end(event) {
                event.target.classList.remove('resizing');
                const textDiv = event.target.querySelector('div[class^="activity-block-text"]');
                const timeLabel = event.target.querySelector('.time-label');
                if (timeLabel) {
                    timeLabel.style.display = 'block'; // Ensure time label stays visible after resize
                }
                if (textDiv) {
                    // Get the current length from the block's dataset
                    const length = parseInt(event.target.dataset.length);
                    // Update classes based on length and mode
                    textDiv.className = getIsMobile()
                        ? (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow')
                        : (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical');
                }
                updateButtonStates();
            }
        }
    });
    
    // Add click handling with debounce
    let lastClickTime = 0;
    const CLICK_DELAY = 300; // milliseconds

    targetTimeline.addEventListener('click', (e) => {
        // Only process clicks on the active timeline
        if (!targetTimeline || targetTimeline !== window.timelineManager.activeTimeline) return;
        
        // Prevent double-clicks
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < CLICK_DELAY) return;
        lastClickTime = currentTime;

        if (!selectedActivity || e.target.closest('.activity-block')) return;
        
        const currentKey = getCurrentTimelineKey();
        // Check if timeline is full before proceeding
        if (isTimelineFull()) {
            const block = document.createElement('div');
            block.className = 'activity-block invalid';
            setTimeout(() => block.remove(), 400); // Remove after animation
            return;
        }
        
        // Ensure we're working with the current timeline data
        window.timelineManager.activities[currentKey] = getCurrentTimelineData();

        const rect = targetTimeline.getBoundingClientRect();
        const isMobile = getIsMobile();
        let clickPositionPercent;
        
        if (isMobile) {
            const y = e.clientY - rect.top;
            const clampedY = Math.max(0, Math.min(y, rect.height));
            clickPositionPercent = (clampedY / rect.height) * 100;
        } else {
            const x = e.clientX - rect.left;
            const clampedX = Math.max(0, Math.min(x, rect.width));
            clickPositionPercent = (clampedX / rect.width) * 100;
        }
        
        if (clickPositionPercent >= 100) {
            return;
        }

        // Get minutes and find nearest 10-minute markers
        let clickMinutes = positionToMinutes(clickPositionPercent);
        if (clickMinutes === null) {
            return;
        }
        
        const [startMinutes, endMinutes] = findNearestMarkers(clickMinutes, isMobile);

        if (isNaN(startMinutes) || isNaN(endMinutes)) {
            console.error('Invalid minutes calculation:', { startMinutes, endMinutes });
            alert('Cannot place activity here due to invalid position.');
            return;
        }
        
        // Check if activity can be placed at this position
        if (!canPlaceActivity(startMinutes, endMinutes, null)) {
            console.error('Activity placement blocked:', { startMinutes, endMinutes });
            const block = document.createElement('div');
            block.className = 'activity-block invalid';
            block.style.backgroundColor = selectedActivity.color;
            
            // Calculate position percentages
            const startPositionPercent = minutesToPercentage(startMinutes);
            const blockSize = (10 / 1440) * 100;  // 10 minutes as percentage of day
            
            if (isMobile) {
                block.style.height = `${blockSize}%`;
                block.style.top = `${startPositionPercent}%`;
                block.style.width = '50%';
                block.style.left = '25%';
            } else {
                block.style.width = `${blockSize}%`;
                block.style.left = `${startPositionPercent}%`;
                block.style.height = '50%';
                block.style.top = '25%';
            }
            
            targetTimeline.appendChild(block);
            setTimeout(() => block.remove(), 400); // Remove after animation
            return;
        }

        const currentBlock = document.createElement('div');
        currentBlock.className = 'activity-block';
        currentBlock.dataset.timelineKey = getCurrentTimelineKey();
        currentBlock.dataset.start = formatTimeHHMM(startMinutes);
        currentBlock.dataset.end = formatTimeHHMM(endMinutes);
        currentBlock.dataset.length = endMinutes - startMinutes;
        currentBlock.dataset.category = selectedActivity.category;
        currentBlock.dataset.mode = selectedActivity.selections ? 'multiple-choice' : 'single-choice';
        currentBlock.dataset.count = selectedActivity.selections ? selectedActivity.selections.length : 1;
        if (selectedActivity.selections) {
            // Multiple selections - create split background
            const colors = selectedActivity.selections.map(s => s.color);
            const isMobile = getIsMobile();
            const numSelections = colors.length;
            const percentage = 100 / numSelections;
            
            if (isMobile) {
                // Horizontal splits for mobile
                const stops = colors.map((color, index) => 
                    `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
                ).join(', ');
                currentBlock.style.background = `linear-gradient(to right, ${stops})`;
            } else {
                // Vertical splits for desktop
                const stops = colors.map((color, index) => 
                    `${color} ${index * percentage}%, ${color} ${(index + 1) * percentage}%`
                ).join(', ');
                currentBlock.style.background = `linear-gradient(to bottom, ${stops})`;
            }
        } else {
            currentBlock.style.backgroundColor = selectedActivity.color;
        }
        const textDiv = document.createElement('div');
        let combinedActivityText;

        if (selectedActivity.selections) {
            if (DEBUG_MODE) {
                console.log('Multiple selections:', selectedActivity.selections);
            }
            // For multiple selections, join names with line break in the text div
            textDiv.innerHTML = selectedActivity.selections.map(s => s.name).join('<br>');
            // But join with vertical separator for storing in timelineManager 
            combinedActivityText = selectedActivity.selections.map(s => s.name).join(' | ');
        } else {
            textDiv.textContent = selectedActivity.name;
            combinedActivityText = selectedActivity.name;
        }
        textDiv.style.maxWidth = '90%';
        textDiv.style.overflow = 'hidden';
        textDiv.style.textOverflow = 'ellipsis';
        textDiv.style.whiteSpace = 'nowrap';
        // Set initial class based on length and mode
        const length = parseInt(currentBlock.dataset.length);

        // Always use narrow text in mobile mode, add wide and resized only if length >= 60
        textDiv.className = getIsMobile() 
            ? (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow')
            : (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical');
        currentBlock.appendChild(textDiv);
        
        // Convert minutes to percentage for positioning
        const startPositionPercent = minutesToPercentage(startMinutes);
        const endPositionPercent = minutesToPercentage(endMinutes);
        // Set block size to exactly 10/1440 percentage (10 minutes out of 24 hours)
        let blockSize = (10 / 1440) * 100;  // This equals approximately 0.694444%
        
        // Ensure minimum block width is maintained
        blockSize = Math.max(blockSize, calculateMinimumBlockWidth());
        
        // Adjust end time to match the block size
        const adjustedEndMinutes = startMinutes + 10;
        currentBlock.dataset.end = formatTimeHHMM(adjustedEndMinutes);

        // Fixed dimensions for consistency
        const MOBILE_BLOCK_WIDTH = 75; // 75% width in mobile mode
        const DESKTOP_BLOCK_HEIGHT = 90; // Changed from 60 to 90
        const MOBILE_OFFSET = 25; // Centers the block at 25% from left
        const DESKTOP_OFFSET = 5; // Changed from 25 to 5 to keep blocks centered

        if (isMobile) {
            currentBlock.style.height = `${blockSize}%`;
            currentBlock.style.top = `${startPositionPercent}%`;
            currentBlock.style.width = `${MOBILE_BLOCK_WIDTH}%`;
            currentBlock.style.left = `${MOBILE_OFFSET}%`;
        } else {
            currentBlock.style.width = `${blockSize}%`;
            currentBlock.style.left = `${startPositionPercent}%`;
            currentBlock.style.height = '75%';
            currentBlock.style.top = '25%';
        }
        
        const activitiesContainer = window.timelineManager.activeTimeline.querySelector('.activities') || (() => {
            const container = document.createElement('div');
            container.className = 'activities';
            window.timelineManager.activeTimeline.appendChild(container);
            return container;
        })();

        // Hide all existing time labels
        activitiesContainer.querySelectorAll('.time-label').forEach(label => {
            label.style.display = 'none';
        });

        activitiesContainer.appendChild(currentBlock);

        // Create time label for both mobile and desktop modes
        const timeLabel = createTimeLabel(currentBlock);
        updateTimeLabel(timeLabel, formatTimeHHMM(startMinutes), formatTimeHHMM(endMinutes), currentBlock);
        timeLabel.style.display = 'block'; // Ensure the new label is visible

        // Deselect the activity button after successful placement
        document.querySelectorAll('.activity-button').forEach(btn => btn.classList.remove('selected'));
        selectedActivity = null;

        const startTime = currentBlock.dataset.start;
        const endTime = currentBlock.dataset.end;
        const times = formatTimeDDMMYYYYHHMM(startTime, endTime);
        if (!times.startTime || !times.endTime) {
            throw new Error('Activity start time and end time must be defined');
        }
        // Get activity name and category from the block's text content and dataset
        const activityText = textDiv.textContent;
        const activityCategory = currentBlock.dataset.category;
            
        // Create activity data after all variables are defined
        const activityData = {
            id: generateUniqueId(),
            activity: combinedActivityText,
            category: activityCategory,
            startTime: times.startTime,
            endTime: times.endTime,
            blockLength: parseInt(currentBlock.dataset.length),
            color: selectedActivity?.color || '#808080',
            count: parseInt(currentBlock.dataset.count) || 1
        };
        getCurrentTimelineData().push(activityData);
        currentBlock.dataset.id = activityData.id;

        // Validate timeline after adding activity
        try {
            const timelineKey = currentBlock.dataset.timelineKey;
            window.timelineManager.metadata[timelineKey].validate();
        } catch (error) {
            console.error('Timeline validation failed:', error);
            // Remove the invalid activity
            getCurrentTimelineData().pop();
            currentBlock.remove();
            const block = document.createElement('div');
            block.className = 'activity-block invalid';
            block.style.backgroundColor = selectedActivity.color;
            block.style.width = currentBlock.style.width;
            block.style.height = currentBlock.style.height;
            block.style.top = currentBlock.style.top;
            block.style.left = currentBlock.style.left;
            targetTimeline.appendChild(block);
            setTimeout(() => block.remove(), 400);
            return;
        }

        updateButtonStates();


    });
}


// Helper function to scroll to active timeline

async function init() {
    try {
        // Load initial timeline data
        const response = await fetch('activities.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Instructions footer is now always visible by default
        
        // Check if instructions are enabled
        if (data.general && data.general.instructions) {
            const fromInstructions = document.referrer.includes('instructions/3.html');
            const inInstructions = window.location.pathname.includes('/instructions/');
            
            // Only redirect to instructions if:
            // 1. Not coming from instructions page 3
            // 2. Not already in instructions
            // 3. No instruction pages in browser history
            if (!fromInstructions && !inInstructions && !sessionStorage.getItem('instructionsViewed')) {
                sessionStorage.setItem('instructionsViewed', 'true');
                window.location.href = 'instructions/1.html';
                return;
            }
        }
        
        // Initialize timeline management structure with only timeline keys
        window.timelineManager.keys = Object.keys(data.timeline);
        window.timelineManager.keys.forEach(timelineKey => {
            window.timelineManager.metadata[timelineKey] = new Timeline(timelineKey, data.timeline[timelineKey]);
            window.timelineManager.activities[timelineKey] = [];
        });

        // Create timelines wrapper if it doesn't exist
        const timelinesWrapper = document.querySelector('.timelines-wrapper');
        if (!timelinesWrapper) {
            throw new Error('Timelines wrapper not found');
        }

        // Initialize first timeline using addNextTimeline
        window.timelineManager.currentIndex = -1; // Start at -1 so first addNextTimeline() sets to 0
        await addNextTimeline();
        
        // Set initial data-mode on activities container
        const activitiesContainerElement = document.querySelector("#activitiesContainer");
        const currentKey = getCurrentTimelineKey();
        if (currentKey && window.timelineManager.metadata[currentKey]) {
            activitiesContainerElement.setAttribute('data-mode', window.timelineManager.metadata[currentKey].mode);
        }
        
        // Scroll to first timeline in mobile layout
        scrollToActiveTimeline();
        
        initButtons();
        
        // Add resize event listener
        window.addEventListener('resize', handleResize);

        if (DEBUG_MODE) {
            console.log('Initialized timeline structure:', window.timelineManager);
        }
    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('activitiesContainer').innerHTML = 
            '<p style="color: red;">Error loading activities. Please refresh the page to try again. Error: ' + error.message + '</p>';
    }
}

init().catch(error => {
    console.error('Failed to initialize application:', error);
    document.getElementById('activitiesContainer').innerHTML = 
        '<p style="color: red;">Error loading activities. Please refresh the page to try again. Error: ' + error.message + '</p>';
});
