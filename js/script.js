import { TimelineMarker } from './timeline_marker.js';
import { Timeline } from './timeline.js';
import { TimelineContainer } from './timeline_container.js';
import i18n from './i18n.js';
import { 
    getCurrentTimelineData, 
    getCurrentTimelineKey, 
    createTimelineDataFrame, 
    sendData,
    validateMinCoverage,
    getTimelineCoverage,
    calculateTimeDifference,
    syncURLParamsToStudy
} from './utils.js';
import { updateIsMobile, getIsMobile } from './globals.js';
import { 
    createModal, 
    createFloatingAddButton, 
    updateFloatingButtonPosition, 
    updateButtonStates, 
    initButtons,
    updateDebugOverlay,
    hideDebugOverlay,
    updateGradientBarLayout,
    scrollToActiveTimeline,
    updateTimelineCountVariable,
    initDebugOverlay,
    handleResize,
    preventPullToRefresh,
    updateHeaderHeight,
    updateFooterHeight
} from './ui.js';
import { 
    DEBUG_MODE,
    MINUTES_PER_DAY,
    INCREMENT_MINUTES,
    DEFAULT_ACTIVITY_LENGTH,
    TIMELINE_START_HOUR,
    TIMELINE_HOURS
} from './constants.js';
import { checkAndRequestPID } from './utils.js';

// Make window.selectedActivity a global property that persists across DOM changes
window.selectedActivity = null;

// Single timeline management object
window.timelineManager = {
    metadata: {}, // Timeline metadata (former timelines object)
    activities: {}, // Timeline activities (former timelineData object)
    initialized: new Set(), // Tracks initialized timelines
    activeTimeline: null, // Will be set when first timeline is created
    keys: [], // Available timeline keys
    currentIndex: 0, // Current timeline index
    study: {}, // Store URL parameters
    general: {} // Store general configuration
};

// Function to calculate timeline coverage in minutes
window.getTimelineCoverage = getTimelineCoverage;

import { 
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
    updateTimeLabel
} from './utils.js';

// NEW: Helper functions to format timeline times based on our 04:00 (240 minutes) rule
function formatTimelineStart(minutes) {
    // Normalize to current day (0-1440)
    const modMinutes = minutes % 1440;
    // For start times, if the time is before 04:00, mark as next day
    const addNextDayMarker = modMinutes < 240;
    return formatTimeHHMM(modMinutes, addNextDayMarker);
}

function formatTimelineEnd(minutes) {
    const modMinutes = minutes % 1440;
    // For end times, we want to mark 04:00 as next day as well (<= 240)
    const addNextDayMarker = modMinutes <= 240;
    return formatTimeHHMM(modMinutes, addNextDayMarker);
}

// Function to restore an existing timeline from past-initialized-timelines-wrapper
async function restoreNextTimeline(nextTimelineIndex, nextTimelineKey) {
    // Increment the current index
    window.timelineManager.currentIndex = nextTimelineIndex;
    
    try {
        // Load timeline data (for categories/activities)
        const categories = await fetchActivities(nextTimelineKey);
        
        // Update UI for next timeline with animation
        const nextTimeline = window.timelineManager.metadata[nextTimelineKey];
        const timelineHeader = document.querySelector('.timeline-header');
        const timelineTitle = document.querySelector('.timeline-title');
        const timelineDescription = document.querySelector('.timeline-description');
        
        // Animation setup
        timelineHeader.classList.remove('flip-animation');
        void timelineHeader.offsetWidth;
        timelineHeader.classList.add('flip-animation');
        
        // Update content
        timelineTitle.textContent = nextTimeline.name;
        timelineDescription.textContent = nextTimeline.description;
        
        void timelineHeader.offsetWidth;
        timelineHeader.classList.add('flip-animation');
        
        timelineHeader.addEventListener('animationend', () => {
            timelineHeader.classList.remove('flip-animation');
        }, {once: true});

        const activeTimelineWrapper = document.querySelector('.last-initialized-timeline-wrapper');
        const pastTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
        
        // Move current timeline to past wrapper
        const currentTimeline = window.timelineManager.activeTimeline;
        if (currentTimeline && currentTimeline.parentElement) {
            currentTimeline.setAttribute('data-active', 'false');
            currentTimeline.parentElement.setAttribute('data-active', 'false');
            pastTimelinesWrapper.appendChild(currentTimeline.parentElement);
            updateTimelineCountVariable();
        }
        
        // Clear active wrapper
        activeTimelineWrapper.innerHTML = '';
        
        // Move the next timeline from past wrapper to active wrapper
        const nextTimelineElement = document.getElementById(nextTimelineKey);
        if (nextTimelineElement && nextTimelineElement.parentElement) {
            nextTimelineElement.setAttribute('data-active', 'true');
            nextTimelineElement.parentElement.setAttribute('data-active', 'true');
            activeTimelineWrapper.appendChild(nextTimelineElement.parentElement);
            
            // Set active timeline reference
            window.timelineManager.activeTimeline = nextTimelineElement;
            
            // Re-initialize timeline interaction
            initTimelineInteraction(window.timelineManager.activeTimeline);
        }

        // Render activities for restored timeline
        renderActivities(categories);
        
        // Scroll to active timeline in mobile view
        if (getIsMobile()) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Reset button states
        updateButtonStates();

        // Scroll to the active timeline
        scrollToActiveTimeline();

        if (DEBUG_MODE) {
            console.log(`Restored ${nextTimelineKey} timeline from past wrapper`);
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

        // Update floating button position after timeline changes
        updateFloatingButtonPosition();

    } catch (error) {
        console.error(`Error restoring ${nextTimelineKey} timeline:`, error);
        throw new Error(`Failed to restore ${nextTimelineKey} timeline: ${error.message}`);
    }
}

// Function to add next timeline
async function addNextTimeline() {
    if (DEBUG_MODE) {
        console.log(`Current timeline data saved:`, window.timelineManager.activities);
    }

    // Check if we're at the end of timelines before incrementing
    if (window.timelineManager.currentIndex + 1 >= window.timelineManager.keys.length) {
        if (DEBUG_MODE) {
            console.log('All timelines initialized');
        }
        return;
    }

    // Get the next timeline key before incrementing
    const nextTimelineIndex = window.timelineManager.currentIndex + 1;
    const nextTimelineKey = window.timelineManager.keys[nextTimelineIndex];
    
    // Check if the next timeline already exists in past-initialized-timelines-wrapper
    const pastTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
    const existingNextTimeline = document.getElementById(nextTimelineKey);
    
    if (existingNextTimeline && pastTimelinesWrapper.contains(existingNextTimeline.parentElement)) {
        // Timeline exists in past wrapper, restore it instead of creating new one
        if (DEBUG_MODE) {
            console.log(`Restoring existing timeline "${nextTimelineKey}" from past wrapper`);
        }
        await restoreNextTimeline(nextTimelineIndex, nextTimelineKey);
        return;
    }
    
    // If timeline doesn't exist in past wrapper but exists elsewhere, skip creation
    if (existingNextTimeline || window.timelineManager.initialized.has(nextTimelineKey)) {
        console.warn(`Timeline with key "${nextTimelineKey}" already exists or is initialized, skipping creation`);
        return;
    }

    // Only increment the index after validation passes
    window.timelineManager.currentIndex = nextTimelineIndex;

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

        // Clear any existing timeline containers to prevent duplicates
        const activeTimelineWrapper = document.querySelector('.last-initialized-timeline-wrapper');
        const inactiveTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
        
        // For the first timeline, clear everything to ensure a clean start
        if (window.timelineManager.currentIndex === 0) {
            activeTimelineWrapper.innerHTML = '';
            inactiveTimelinesWrapper.innerHTML = '';
            console.log('Cleared all timeline wrappers for first timeline initialization');
        } else {
            // Move previous timeline to inactive wrapper BEFORE adding new one
            const previousTimeline = window.timelineManager.activeTimeline;
            if (previousTimeline && previousTimeline.parentElement) {
                previousTimeline.setAttribute('data-active', 'false');
                previousTimeline.parentElement.setAttribute('data-active', 'false');
                
                // Move the previous timeline to the inactive wrapper
                inactiveTimelinesWrapper.appendChild(previousTimeline.parentElement);
                
                // Update timeline count variable
                updateTimelineCountVariable();
            }
            
            // Clear any existing containers in the active wrapper to prevent duplicates
            activeTimelineWrapper.innerHTML = '';
        }
        
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
        activeTimelineWrapper.appendChild(newTimelineContainer);
        
        // Initialize new timeline and container with proper IDs and mode
        newTimeline.id = nextTimelineKey;
        newTimeline.setAttribute('data-timeline-type', nextTimelineKey);
        newTimeline.setAttribute('data-active', 'true');
        newTimeline.setAttribute('data-mode', window.timelineManager.metadata[nextTimelineKey].mode);
        newTimelineContainer.setAttribute('data-active', 'true');
        
        // Set active timeline reference
        window.timelineManager.activeTimeline = newTimeline;

        // Initialize activities array if not exists
        window.timelineManager.activities[nextTimelineKey] = window.timelineManager.activities[nextTimelineKey] || [];

        // Scroll to active timeline in mobile view
        if (getIsMobile()) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Initialize timeline with markers and containers
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

        // Update floating button position after timeline changes
        updateFloatingButtonPosition();

    } catch (error) {
        console.error(`Error switching to ${nextTimelineKey} timeline:`, error);
        throw new Error(`Failed to switch to ${nextTimelineKey} timeline: ${error.message}`);
    }
}

// Function to go back to previous timeline
async function goToPreviousTimeline() {
    if (DEBUG_MODE) {
        console.log(`Going back from timeline ${window.timelineManager.currentIndex}`);
    }

    // Check if we can go back
    if (window.timelineManager.currentIndex <= 0) {
        if (DEBUG_MODE) {
            console.log('Already at first timeline, cannot go back');
        }
        return;
    }

    // Get the previous timeline key
    const previousTimelineIndex = window.timelineManager.currentIndex - 1;
    const previousTimelineKey = window.timelineManager.keys[previousTimelineIndex];
    
    // Decrement the index
    window.timelineManager.currentIndex = previousTimelineIndex;

    try {
        // Load previous timeline data
        const categories = await fetchActivities(previousTimelineKey);
        
        // Update UI for previous timeline with animation
        const previousTimeline = window.timelineManager.metadata[previousTimelineKey];
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
        timelineTitle.textContent = previousTimeline.name;
        timelineDescription.textContent = previousTimeline.description;
        
        // Trigger reflow to ensure animation plays
        void timelineHeader.offsetWidth;
        
        // Add animation class
        timelineHeader.classList.add('flip-animation');
        
        // Remove animation class after it finishes
        timelineHeader.addEventListener('animationend', () => {
            timelineHeader.classList.remove('flip-animation');
        }, {once: true});

        const activeTimelineWrapper = document.querySelector('.last-initialized-timeline-wrapper');
        const inactiveTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
        
        // Move all future timelines to past wrapper (so they can be restored later)
        const currentTimelineIndex = window.timelineManager.currentIndex + 1; // +1 because we already decremented
        for (let i = currentTimelineIndex; i < window.timelineManager.keys.length; i++) {
            const futureTimelineKey = window.timelineManager.keys[i];
            const futureTimelineElement = document.getElementById(futureTimelineKey);
            if (futureTimelineElement && futureTimelineElement.parentElement) {
                // Move to past wrapper instead of removing
                futureTimelineElement.setAttribute('data-active', 'false');
                futureTimelineElement.parentElement.setAttribute('data-active', 'false');
                inactiveTimelinesWrapper.appendChild(futureTimelineElement.parentElement);
            }
        }
        
        // Move current timeline to inactive wrapper
        const currentTimeline = window.timelineManager.activeTimeline;
        if (currentTimeline && currentTimeline.parentElement) {
            currentTimeline.setAttribute('data-active', 'false');
            currentTimeline.parentElement.setAttribute('data-active', 'false');
            
            // Move the current timeline to the inactive wrapper
            inactiveTimelinesWrapper.appendChild(currentTimeline.parentElement);
            
            // Update timeline count variable
            updateTimelineCountVariable();
        }
        
        // Clear active wrapper
        activeTimelineWrapper.innerHTML = '';
        
        // Find the previous timeline in inactive wrapper and move it back to active
        const previousTimelineElement = document.getElementById(previousTimelineKey);
        if (previousTimelineElement && previousTimelineElement.parentElement) {
            // Move previous timeline back to active wrapper
            previousTimelineElement.setAttribute('data-active', 'true');
            previousTimelineElement.parentElement.setAttribute('data-active', 'true');
            activeTimelineWrapper.appendChild(previousTimelineElement.parentElement);
            
            // Set active timeline reference
            window.timelineManager.activeTimeline = previousTimelineElement;
            
            // IMPORTANT: Re-initialize timeline interaction for the reactivated timeline
            // This ensures that click events and activity placement still work
            initTimelineInteraction(window.timelineManager.activeTimeline);
        } else {
            // If timeline doesn't exist in inactive wrapper, recreate it
            const newTimelineContainer = document.createElement('div');
            newTimelineContainer.className = 'timeline-container';
            
            // Add title element
            const titleDiv = document.createElement('div');
            titleDiv.className = 'title';
            titleDiv.textContent = window.timelineManager.metadata[previousTimelineKey].name;
            newTimelineContainer.appendChild(titleDiv);
            
            const newTimeline = document.createElement('div');
            newTimeline.className = 'timeline';
            newTimelineContainer.appendChild(newTimeline);
            
            // Add timeline to active wrapper
            activeTimelineWrapper.appendChild(newTimelineContainer);
            
            // Initialize timeline and container with proper IDs and mode
            newTimeline.id = previousTimelineKey;
            newTimeline.setAttribute('data-timeline-type', previousTimelineKey);
            newTimeline.setAttribute('data-active', 'true');
            newTimeline.setAttribute('data-mode', window.timelineManager.metadata[previousTimelineKey].mode);
            newTimelineContainer.setAttribute('data-active', 'true');
            
            // Set active timeline reference
            window.timelineManager.activeTimeline = newTimeline;
            
            // Initialize timeline with markers and containers
            initTimeline(window.timelineManager.activeTimeline);
            
            // Initialize interaction for the timeline
            initTimelineInteraction(window.timelineManager.activeTimeline);
        }

        // Activities will be restored automatically when the timeline is re-initialized
        // The activity data is already stored in window.timelineManager.activities[previousTimelineKey]

        // Render activities categories for previous timeline
        renderActivities(categories);

        // Scroll to active timeline in mobile view
        if (getIsMobile()) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Reset button states
        updateButtonStates();

        // Scroll to the active timeline
        scrollToActiveTimeline();

        if (DEBUG_MODE) {
            console.log(`Switched back to ${previousTimelineKey} timeline`);
            console.log('Timeline data structure:', window.timelineManager.activities);
        }

        // Update activities container data-mode
        const activitiesContainerElement = document.querySelector("#activitiesContainer");
        if (activitiesContainerElement) {
            activitiesContainerElement.setAttribute('data-mode', window.timelineManager.metadata[previousTimelineKey].mode);
        }

        // Update floating button position after timeline changes
        updateFloatingButtonPosition();

    } catch (error) {
        console.error(`Error switching back to ${previousTimelineKey} timeline:`, error);
        throw new Error(`Failed to switch back to ${previousTimelineKey} timeline: ${error.message}`);
    }
}

function logDebugInfo() {
    if (DEBUG_MODE) {
        console.log('timelineData:', timelineData);
    }
}

async function fetchActivities(key) {
    try {
        const response = await fetch('settings/activities.json');
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

        // Timeline management structure should already be initialized in init()
        // This function only loads categories for the specific timeline

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

// Create a child items modal for activity selection
function createChildItemsModal() {
    // Check if modal already exists
    if (document.getElementById('childItemsModal')) {
        return document.getElementById('childItemsModal');
    }
    
    const modal = document.createElement('div');
    modal.id = 'childItemsModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    
    const closeButton = document.createElement('span');
    closeButton.className = 'close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    const title = document.createElement('h3');
    title.id = 'childItemsModalTitle';
    title.setAttribute('data-i18n', 'modals.childItems.title');
    title.textContent = window.i18n ? window.i18n.t('modals.childItems.title') : 'Select an option';
    
    modalHeader.appendChild(title);
    modalHeader.appendChild(closeButton);
    
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.id = 'childItemsContainer';
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modal.appendChild(modalContent);
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    return modal;
}

// Function to render child items in the modal
function renderChildItems(activity, categoryName) {
    const modal = createChildItemsModal();
    const container = document.getElementById('childItemsContainer');
    const title = document.getElementById('childItemsModalTitle');
    
    // Set the title to the parent activity name
    if (window.i18n && window.i18n.isReady()) {
        const template = window.i18n.t('modals.childItems.titleFor');
        title.textContent = template.replace(/\{activityName\}/g, activity.name);
    } else {
        title.textContent = `Select an option for "${activity.name}"`;
    }
    
    // Clear previous content
    container.innerHTML = '';
    
    // Create buttons for each child item
    if (activity.childItems && activity.childItems.length > 0) {
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'child-item-buttons';
        
        activity.childItems.forEach(childItem => {
            const button = document.createElement('button');
            button.className = 'child-item-button';
            button.textContent = childItem.name;
            button.style.setProperty('--color', childItem.color || activity.color);
            
            button.addEventListener('click', () => {
                // Use parent activity properties but with child item name
                window.selectedActivity = {
                    name: childItem.name,
                    parentName: activity.name,
                    color: childItem.color || activity.color,
                    category: categoryName,
                    selected: childItem.name  // Store the selected child item
                };
                
                // Close the modal
                modal.style.display = 'none';
                
                // Also close activities modal if open
                const activitiesModal = document.getElementById('activitiesModal');
                if (activitiesModal) {
                    activitiesModal.style.display = 'none';
                }
            });
            
            buttonsContainer.appendChild(button);
        });
        
        container.appendChild(buttonsContainer);
    }
    
    // Show the modal
    modal.style.display = 'block';
}

function renderActivities(categories, container = document.getElementById('activitiesContainer')) {
    container.innerHTML = '';
    
    // Set data-mode attribute based on current timeline's mode
    const currentKey = getCurrentTimelineKey();
    if (currentKey && window.timelineManager.metadata[currentKey]) {
        container.setAttribute('data-mode', window.timelineManager.metadata[currentKey].mode);
    }

    const isMobile = getIsMobile();
    const isModal = container.id === 'modalActivitiesContainer';

    // Only create accordion if this is the modal container and in mobile view
    if (isMobile && isModal) {
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
                // Add indicator class if activity has child items
                if (activity.childItems && activity.childItems.length > 0) {
                    activityButton.classList.add('has-child-items');
                }
                
                activityButton.style.setProperty('--color', activity.color);
                
                if (isMultipleChoice) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'checkmark';
                    activityButton.appendChild(checkmark);
                }
                
                const textSpan = document.createElement('span');
                textSpan.className = 'activity-text';
                
                // Create name span
                const nameSpan = document.createElement('span');
                nameSpan.className = 'activity-name';
                nameSpan.textContent = activity.name;
                textSpan.appendChild(nameSpan);
                
                // Add examples if they exist
                if (activity.examples) {
                    const examplesSpan = document.createElement('span');
                    examplesSpan.className = 'activity-examples';
                    examplesSpan.textContent = activity.examples;
                    textSpan.appendChild(examplesSpan);
                }
                
                activityButton.appendChild(textSpan);
                activityButton.addEventListener('click', () => {
                    const activitiesContainer = activityButton.closest('#activitiesContainer, #modalActivitiesContainer');
                    const isMultipleChoice = activitiesContainer.getAttribute('data-mode') === 'multiple-choice';
                    const categoryButtons = activityButton.closest('.activity-category').querySelectorAll('.activity-button');
                    
                    // Check if this is the "other not listed" button
                    if (activity.name.toLowerCase().includes('other not listed (enter)') || 
                        activity.name.toLowerCase().includes('other time use (please specify)') ||
                        activity.name.toLowerCase().includes('other activities not listed')) {
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
                                    window.selectedActivity = {
                                        name: btn === activityButton ? customText : btn.querySelector('.activity-text').textContent,
                                        color: btn.style.getPropertyValue('--color')
                                    };
                                } else {
                                    categoryButtons.forEach(b => b.classList.remove('selected'));
                                    window.selectedActivity = {
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
                    
                    // Check if activity has child items
                    if (activity.childItems && activity.childItems.length > 0) {
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        activityButton.classList.add('selected');
                        
                        // Show child items modal
                        renderChildItems(activity, category.name);
                        return;
                    }
                    
                    if (isMultipleChoice) {
                        // Toggle selection for this button
                        activityButton.classList.toggle('selected');
            
                        // Get all selected activities in this category
                        const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
            
                        if (selectedButtons.length > 0) {
                            window.selectedActivity = {
                                selections: selectedButtons.map(btn => ({
                                    name: btn.textContent,
                                    color: btn.style.getPropertyValue('--color')
                                })),
                                category: category.name
                            };
                        } else {
                            // Only clear window.selectedActivity in multiple-choice mode if user actively deselected
                            // Don't clear if we're in a modal that's about to close
                            const isInModal = activityButton.closest('#modalActivitiesContainer');
                            if (!isInModal) {
                                console.log('[ACTIVITY] Clearing window.selectedActivity - not in modal');
                                window.selectedActivity = null;
                            } else {
                                console.log('[ACTIVITY] NOT clearing window.selectedActivity - in modal');
                            }
                        }
                    } else {
                        // Single choice mode
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        window.selectedActivity = {
                            name: activity.name,
                            color: activity.color,
                            category: category.name
                        };
                        console.log('[ACTIVITY] Selected activity:', window.selectedActivity);
                        activityButton.classList.add('selected');
                    }
                    // Only close modal in single-choice mode
                    if (!isMultipleChoice) {
                        // Store the selected activity before closing modal to prevent it from being cleared
                        const preservedActivity = window.selectedActivity;
                        
                        // Force close modals with a slight delay on mobile
                        if (getIsMobile()) {
                            setTimeout(() => {
                                const activitiesModal = document.getElementById('activitiesModal');
                                const customActivityModal = document.getElementById('customActivityModal');
                                if (activitiesModal) {
                                    activitiesModal.style.cssText = 'display: none !important';
                                }
                                if (customActivityModal) {
                                    customActivityModal.style.cssText = 'display: none !important';
                                }
                                // Restore window.selectedActivity after modal closes in case it was cleared
                                if (preservedActivity && !window.selectedActivity) {
                                    window.selectedActivity = preservedActivity;
                                    console.log('[MODAL] Restored window.selectedActivity:', window.selectedActivity);
                                } else {
                                    console.log('[MODAL] window.selectedActivity after close:', window.selectedActivity);
                                }
                            }, 50);
                        } else {
                            // Immediate close on desktop
                            const activitiesModal = document.getElementById('activitiesModal');
                            const customActivityModal = document.getElementById('customActivityModal');
                            if (activitiesModal) {
                                activitiesModal.style.cssText = 'display: none !important';
                            }
                            if (customActivityModal) {
                                customActivityModal.style.cssText = 'display: none !important';
                            }
                            // Restore window.selectedActivity after modal closes in case it was cleared
                            if (preservedActivity && !window.selectedActivity) {
                                window.selectedActivity = preservedActivity;
                            }
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
                // Add indicator class if activity has child items
                if (activity.childItems && activity.childItems.length > 0) {
                    activityButton.classList.add('has-child-items');
                }
                
                activityButton.style.setProperty('--color', activity.color);
                
                if (isMultipleChoice) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'checkmark';
                    activityButton.appendChild(checkmark);
                }
                
                const textSpan = document.createElement('span');
                textSpan.className = 'activity-text';
                
                // Create name span
                const nameSpan = document.createElement('span');
                nameSpan.className = 'activity-name';
                nameSpan.textContent = activity.name;
                textSpan.appendChild(nameSpan);
                
                // Add examples if they exist
                if (activity.examples) {
                    const examplesSpan = document.createElement('span');
                    examplesSpan.className = 'activity-examples';
                    examplesSpan.textContent = activity.examples;
                    textSpan.appendChild(examplesSpan);
                }
                
                activityButton.appendChild(textSpan);
                activityButton.addEventListener('click', () => {
                    const activitiesContainer = activityButton.closest('#activitiesContainer, #modalActivitiesContainer');
                    const isMultipleChoice = activitiesContainer.getAttribute('data-mode') === 'multiple-choice';
                    const categoryButtons = activityButton.closest('.activity-category').querySelectorAll('.activity-button');
                    
                    // Check if this is the "other not listed" button
                    if (activity.name.toLowerCase().includes('other not listed (enter)') || 
                        activity.name.toLowerCase().includes('other time use (please specify)') ||
                        activity.name.toLowerCase().includes('other activities not listed')) {
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
                                    window.selectedActivity = {
                                        selections: selectedButtons.map(btn => ({
                                            name: btn === activityButton ? customText : btn.querySelector('.activity-text').textContent,
                                            color: btn.style.getPropertyValue('--color')
                                        })),
                                        category: category.name
                                    };
                                } else {
                                    categoryButtons.forEach(b => b.classList.remove('selected'));
                                    window.selectedActivity = {
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
                    
                    // Check if activity has child items
                    if (activity.childItems && activity.childItems.length > 0) {
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        activityButton.classList.add('selected');
                        
                        // Show child items modal
                        renderChildItems(activity, category.name);
                        return;
                    }
                    
                    if (isMultipleChoice) {
                        // Toggle selection for this button
                        activityButton.classList.toggle('selected');
            
                        // Get all selected activities in this category
                        const selectedButtons = Array.from(categoryButtons).filter(btn => btn.classList.contains('selected'));
            
                        if (selectedButtons.length > 0) {
                            window.selectedActivity = {
                                selections: selectedButtons.map(btn => ({
                                    name: btn.querySelector('.activity-text').textContent,
                                    color: btn.style.getPropertyValue('--color')
                                })),
                                category: category.name
                            };
                        } else {
                            // Only clear window.selectedActivity in multiple-choice mode if user actively deselected
                            // Don't clear if we're in a modal that's about to close
                            const isInModal = activityButton.closest('#modalActivitiesContainer');
                            if (!isInModal) {
                                console.log('[ACTIVITY] Clearing window.selectedActivity - not in modal');
                                window.selectedActivity = null;
                            } else {
                                console.log('[ACTIVITY] NOT clearing window.selectedActivity - in modal');
                            }
                        }
                    } else {
                        // Single choice mode
                        categoryButtons.forEach(b => b.classList.remove('selected'));
                        window.selectedActivity = {
                            name: activity.name,
                            color: activity.color,
                            category: category.name
                        };
                        console.log('[ACTIVITY] Selected activity:', window.selectedActivity);
                        activityButton.classList.add('selected');
                    }
                    // Only close modal in single-choice mode
                    if (!isMultipleChoice) {
                        // Store the selected activity before closing modal to prevent it from being cleared
                        const preservedActivity = window.selectedActivity;
                        
                        // Force close modals with a slight delay on mobile
                        if (getIsMobile()) {
                            setTimeout(() => {
                                const activitiesModal = document.getElementById('activitiesModal');
                                const customActivityModal = document.getElementById('customActivityModal');
                                if (activitiesModal) {
                                    activitiesModal.style.cssText = 'display: none !important';
                                }
                                if (customActivityModal) {
                                    customActivityModal.style.cssText = 'display: none !important';
                                }
                                // Restore window.selectedActivity after modal closes in case it was cleared
                                if (preservedActivity && !window.selectedActivity) {
                                    window.selectedActivity = preservedActivity;
                                    console.log('[MODAL] Restored window.selectedActivity:', window.selectedActivity);
                                } else {
                                    console.log('[MODAL] window.selectedActivity after close:', window.selectedActivity);
                                }
                            }, 50);
                        } else {
                            // Immediate close on desktop
                            const activitiesModal = document.getElementById('activitiesModal');
                            const customActivityModal = document.getElementById('customActivityModal');
                            if (activitiesModal) {
                                activitiesModal.style.cssText = 'display: none !important';
                            }
                            if (customActivityModal) {
                                customActivityModal.style.cssText = 'display: none !important';
                            }
                            // Restore window.selectedActivity after modal closes in case it was cleared
                            if (preservedActivity && !window.selectedActivity) {
                                window.selectedActivity = preservedActivity;
                            }
                        }
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
            updateDebugOverlay(e.clientX, e.clientY, rect);
        });

        timeline.addEventListener('mouseleave', () => {
            hideDebugOverlay();
        });
    }
}

// Add validation function before the interact.js initialization
function validateActivityBlockTransformation(startMinutes, endMinutes, target) {
    const MIN_BLOCK_LENGTH = 10; // Minimum block length in minutes
    const TIMELINE_START = 240; // 4:00 AM in minutes
    const TIMELINE_END = 1680; // 4:00 AM next day in minutes

    // Normalize end minutes if it wraps to next day
    const normalizedEndMinutes = endMinutes < startMinutes ? endMinutes + 1440 : endMinutes;

    // Calculate block length
    const blockLength = normalizedEndMinutes - startMinutes;

    // Validation checks
    if (blockLength <= 0 || blockLength < MIN_BLOCK_LENGTH) {
        console.warn('Invalid block length:', {
            startTime: formatTimeHHMM(startMinutes),
            endTime: formatTimeHHMM(endMinutes),
            length: blockLength,
            minLength: MIN_BLOCK_LENGTH
        });
        return false;
    }

    if (startMinutes < TIMELINE_START || endMinutes > TIMELINE_END) {
        console.warn('Time out of valid range:', {
            startTime: formatTimeHHMM(startMinutes),
            endTime: formatTimeHHMM(endMinutes),
            validRange: '04:00-04:00(+1)'
        });
        return false;
    }

    return true;
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
            target.dataset.originalHeight = target.style.height;
            target.dataset.originalLeft = target.style.left;
            target.dataset.originalTop = target.style.top;
            target.dataset.originalWidth = target.style.width;
            // Store original raw minutes
            target.dataset.originalStartMinutes = target.dataset.startMinutes || timeToMinutes(target.dataset.start);
            target.dataset.originalEndMinutes = target.dataset.endMinutes || timeToMinutes(target.dataset.end);

            // Ensure autoscroll is enabled when resizing starts
            if (window.autoScrollModule && getIsMobile()) {
                window.autoScrollModule.enable();
            }
        },
        edges: { 
            right: !getIsMobile(), 
            left: !getIsMobile(),
            bottom: getIsMobile(),
            top: getIsMobile()
        },
        modifiers: [
            interact.modifiers.restrictEdges({
                outer: '.timeline',
                endOnly: true
            }),
            interact.modifiers.restrictSize({
                min: { width: 10, height: 10 }
            }),
            // Add snap modifier for 10-minute intervals
            interact.modifiers.snap({
                targets: [
                    interact.snappers.grid({
                        x: timelineRect => (10 / (24 * 60)) * timelineRect.width, // 10-minute intervals
                        y: timelineRect => (10 / (24 * 60)) * timelineRect.height
                    })
                ],
                range: Infinity,
                relativePoints: [ { x: 0, y: 0 } ]
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
                let startMinutes, endMinutes;
                
                // Get time label at the beginning of the handler
                const timeLabel = target.querySelector('.time-label');
                
                target.classList.add('resizing');
                
                if (getIsMobile()) {
                    // Mobile: Handle vertical resizing
                    if (event.edges.top) {
                        // Get raw cursor position from event coordinates
                        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
                        const timelineRect = targetTimeline.getBoundingClientRect();
                        
                        // Calculate relative Y position within timeline bounds
                        const relativeY = clientY - timelineRect.top;
                        const clampedRelativeY = Math.max(0, Math.min(relativeY, timelineRect.height));
                        const positionPercent = (clampedRelativeY / timelineRect.height) * 100;
                        
                        // Convert to raw minutes using timeline-based position
                        const rawMinutes = positionToMinutes(positionPercent, true);
                        startMinutes = Math.round(rawMinutes / 10) * 10;
                        
                        // Keep original end time fixed
                        endMinutes = parseInt(target.dataset.endMinutes);

                        // Debug logging with accurate values
                        if (DEBUG_MODE) {
                            console.log('[Resize Top Edge]:', {
                                clientY,
                                timelineTop: timelineRect.top,
                                relativeY: clampedRelativeY,
                                timelineHeight: timelineRect.height,
                                position: positionPercent.toFixed(2) + '%',
                                time: formatTimeHHMM(startMinutes),
                                startMinutes,
                                endMinutes,
                                coverage: window.getTimelineCoverage()
                            });
                        }

                        // Validate time order
                        if (startMinutes >= endMinutes) {
                            console.warn('Invalid resize detected (vertical/top): Start time would be after end time', {
                                startTime: formatTimeHHMM(startMinutes),
                                endTime: formatTimeHHMM(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.top = target.dataset.originalTop;
                            target.style.height = target.dataset.originalHeight;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Validate transformations
                        if (!validateActivityBlockTransformation(startMinutes, endMinutes, target)) {
                            console.warn('Invalid resize detected (vertical/top): Invalid block transformation', {
                                startTime: formatTimeHHMM(startMinutes),
                                endTime: formatTimeHHMM(endMinutes),
                                blockId: target.dataset.id,
                                reason: 'Block transformation validation failed'
                            });
                            target.style.top = target.dataset.originalTop;
                            target.style.height = target.dataset.originalHeight;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Check for overlaps
                        if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
                            console.warn('Invalid resize detected (vertical/top): Activity overlap', {
                                startTime: formatTimeHHMM(startMinutes),
                                endTime: formatTimeHHMM(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.top = target.dataset.originalTop;
                            target.style.height = target.dataset.originalHeight;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Update position and size using percentages
                        target.style.top = `${minutesToPercentage(startMinutes)}%`;
                        target.style.height = `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`;

                    } else if (event.edges.bottom) {
                        // Keep original start time fixed
                        startMinutes = parseInt(target.dataset.startMinutes);
                        
                        // Get cursor position from event coordinates instead of element rect
                        const clientY = getIsMobile() ? (event.touches ? event.touches[0].clientY : event.clientY) : event.clientY;
                        const timelineRect = targetTimeline.getBoundingClientRect();
                        
                        // Calculate relative Y position within timeline
                        const relativeY = clientY - timelineRect.top;
                        const positionPercent = Math.min(100, Math.max(0, (relativeY / timelineRect.height) * 100));
                        
                        // For vertical bottom-edge resizing we want to allow reaching the timeline end (04:00(+1))
                        const rawMinutes = positionToMinutes(positionPercent, true, { allowEnd: true });
                        
                        endMinutes = Math.round(rawMinutes / 10) * 10;
                        
                        // Debug logging with corrected values
                        if (DEBUG_MODE) {
                            console.log('[Resize Bottom Edge]:', {
                                clientY: clientY,
                                timelineTop: timelineRect.top,
                                relativeY: relativeY,
                                timelineHeight: timelineRect.height,
                                position: positionPercent.toFixed(2) + '%',
                                time: formatTimeHHMM(endMinutes),
                                startMinutes: startMinutes,
                                endMinutes: endMinutes,
                                coverage: window.getTimelineCoverage()
                            });
                        }

                        // Add snap behavior for smoother resizing
                        const currentEndMinutes = parseInt(target.dataset.endMinutes);
                        const minutesDiff = Math.abs(endMinutes - currentEndMinutes);
                        
                        // Only update if the change is at least 10 minutes
                        if (minutesDiff >= 10) {
                            // Validate time order
                            if (endMinutes <= startMinutes) {
                                target.style.height = target.dataset.originalHeight;
                                target.classList.add('invalid');
                                setTimeout(() => target.classList.remove('invalid'), 400);
                                return;
                            }

                            // Validate transformations
                            if (!validateActivityBlockTransformation(startMinutes, endMinutes, target)) {
                                target.style.height = target.dataset.originalHeight;
                                target.classList.add('invalid');
                                setTimeout(() => target.classList.remove('invalid'), 400);
                                return;
                            }

                            // Check for overlaps
                            if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
                                target.style.height = target.dataset.originalHeight;
                                target.classList.add('invalid');
                                setTimeout(() => target.classList.remove('invalid'), 400);
                                return;
                            }

                            // Update size using percentages
                            target.style.height = `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`;
                        }
                    }
                } else {
                    // Desktop: Handle left and right edge resizing differently
                    const tenMinutesWidth = (10 / (24 * 60)) * 100; // Width of 10-minute interval as percentage
                    
                    if (event.edges.left) {
                        // Left edge resizing - adjust start time
                        const newLeft = (event.rect.left - timelineRect.left) / timelineRect.width * 100;
                        startMinutes = positionToMinutes(newLeft);
                        endMinutes = parseInt(target.dataset.endMinutes);

                        // Debug logging with accurate values
                        if (DEBUG_MODE) {
                            console.log('[Resize Left Edge]:', {
                                newLeft: newLeft.toFixed(2) + '%',
                                time: formatTimelineStart(startMinutes),
                                startMinutes,
                                endMinutes,
                                coverage: window.getTimelineCoverage()
                            });
                        }

                        // Validate time order considering next day times
                        const isEndNextDay = endMinutes < 240 || endMinutes >= 1440;
                        const isStartNextDay = startMinutes < 240 || startMinutes >= 1440;
                        
                        // Check if the times would create an invalid order
                        if ((isStartNextDay === isEndNextDay && startMinutes >= endMinutes) || 
                            (!isStartNextDay && isEndNextDay && startMinutes >= 1440)) {
                            console.warn('Invalid resize detected (horizontal/left): Start time would be after end time', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.left = target.dataset.originalLeft;
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Validate transformations
                        if (!validateActivityBlockTransformation(startMinutes, endMinutes, target)) {
                            console.warn('Invalid resize detected (horizontal/left): Invalid block transformation', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id,
                                reason: 'Block transformation validation failed'
                            });
                            target.style.left = target.dataset.originalLeft;
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Check for overlaps
                        if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
                            console.warn('Invalid resize detected (horizontal/left): Activity overlap', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.left = target.dataset.originalLeft;
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Update position and size
                        target.style.left = `${minutesToPercentage(startMinutes)}%`;
                        target.style.width = `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`;

                        // Update data attributes with properly formatted times
                        const newStartTime = formatTimelineStart(startMinutes);
                        const newEndTime = formatTimelineEnd(endMinutes);
                        target.dataset.start = newStartTime;
                        target.dataset.end = newEndTime;
                        target.dataset.startMinutes = startMinutes;
                        target.dataset.endMinutes = endMinutes;
                        target.dataset.length = endMinutes - startMinutes;

                        // Update time label
                        if (timeLabel) {
                            updateTimeLabel(timeLabel, newStartTime, newEndTime, target);
                        }
                    } else if (event.edges.right) {
                        // Right edge resizing - adjust end time using absolute timeline
                        const newRight = (event.rect.right - timelineRect.left) / timelineRect.width * 100;
                        const rawMinutes = positionToMinutes(newRight);
                        endMinutes = Math.round(rawMinutes / 10) * 10;
                        
                        // Maintain original start time in absolute minutes
                        startMinutes = parseInt(target.dataset.startMinutes);

                        // Special case: If we're at the end of timeline (1680 minutes/04:00(+1))
                        const SNAP_THRESHOLD = 99.65;
                        if (newRight >= SNAP_THRESHOLD) {
                            endMinutes = 1680; // Absolute end of timeline (04:00 next day)
                        }

                        // Debug logging with accurate values
                        if (DEBUG_MODE) {
                            console.log('[Resize Right Edge]:', {
                                newRight: newRight.toFixed(2) + '%',
                                time: formatTimelineEnd(endMinutes),
                                startMinutes,
                                endMinutes,
                                coverage: window.getTimelineCoverage()
                            });
                        }

                        // Validate time order considering next day times
                        const isEndNextDay = endMinutes < 240 || endMinutes >= 1440;
                        const isStartNextDay = startMinutes < 240 || startMinutes >= 1440;
                        
                        // Check if the times would create an invalid order
                        if ((isStartNextDay === isEndNextDay && startMinutes >= endMinutes) || 
                            (!isStartNextDay && isEndNextDay && startMinutes >= 1440)) {
                            console.warn('Invalid resize detected (horizontal/right): Start time would be after end time', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }
                        
                        // Validate transformations with absolute times
                        if (!validateActivityBlockTransformation(startMinutes, endMinutes, target)) {
                            console.warn('Invalid resize detected (horizontal/right): Block transformation validation failed', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }

                        // Check for activity overlap
                        if (!canPlaceActivity(startMinutes, endMinutes, target.dataset.id)) {
                            console.warn('Invalid resize detected (horizontal/right): Activity overlap', {
                                startTime: formatTimelineStart(startMinutes),
                                endTime: formatTimelineEnd(endMinutes),
                                blockId: target.dataset.id
                            });
                            target.style.width = target.dataset.originalWidth;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }
                        
                        // Update size
                        target.style.width = `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`;

                        // Update data attributes with properly formatted times
                        const newStartTime = formatTimelineStart(startMinutes);
                        const newEndTime = formatTimelineEnd(endMinutes);
                        target.dataset.start = newStartTime;
                        target.dataset.end = newEndTime;
                        target.dataset.startMinutes = startMinutes;
                        target.dataset.endMinutes = endMinutes;
                        target.dataset.length = endMinutes - startMinutes;

                        // Update time label
                        if (timeLabel) {
                            updateTimeLabel(timeLabel, newStartTime, newEndTime, target);
                        }
                    }
                }
                
                // Update time label and dataset
                if (timeLabel) {
                    // Format and update times - (+1) notation is handled automatically
                    const newStartTime = formatTimeHHMM(startMinutes, false);  // Start time
                    const newEndTime = formatTimeHHMM(endMinutes % MINUTES_PER_DAY, true);
                    
                    // Final validation to ensure we never have negative length
                    let timeDiff = endMinutes - startMinutes;
                    if (timeDiff < 0 && !newEndTime.includes('(+1)')) {
                        // If we have negative length and we're not spanning midnight, revert
                        target.dataset.start = target.dataset.originalStart;
                        target.dataset.end = target.dataset.originalEnd;
                        target.dataset.length = target.dataset.originalLength;
                        target.style.left = target.dataset.originalLeft;
                        target.style.width = `${parseFloat(target.dataset.originalLength) * (100 / 1440)}%`;
                        
                        console.warn('Invalid resize detected (final validation): Negative length', {
                            startTime: newStartTime,
                            endTime: newEndTime,
                            length: timeDiff,
                            blockId: target.dataset.id
                        });
                        
                        target.classList.add('invalid');
                        setTimeout(() => target.classList.remove('invalid'), 400);
                        return;
                    }
                    
                    target.dataset.start = newStartTime;
                    target.dataset.end = newEndTime;
                    target.dataset.length = timeDiff;
                    target.dataset.startMinutes = startMinutes;
                    target.dataset.endMinutes = endMinutes;
                    updateTimeLabel(timeLabel, newStartTime, newEndTime, target);
                    
                    // Update text class based on length and mode
                    const textDiv = target.querySelector('div[class^="activity-block-text"]');
                    if (textDiv) {
                        textDiv.className = getIsMobile()
                            ? (timeDiff >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow')
                            : (timeDiff >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical');
                    }
                    
                    // Update the activity data in timelineManager
                    const activityId = target.dataset.id;
                    const currentData = getCurrentTimelineData();
                    const activityIndex = currentData.findIndex(activity => activity.id === activityId);
                    
                    if (activityIndex !== -1) {
                        const times = formatTimeDDMMYYYYHHMM(newStartTime, newEndTime);
                        if (!times.startTime || !times.endTime) {
                            throw new Error('Activity start time and end time must be defined');
                        }
                        currentData[activityIndex].startTime = times.startTime;
                        currentData[activityIndex].endTime = times.endTime;
                        currentData[activityIndex].blockLength = parseInt(target.dataset.length);

                        // Update original values incrementally
                        target.dataset.originalStart = newStartTime;
                        target.dataset.originalEnd = newEndTime;
                        target.dataset.originalLength = target.dataset.length;
                        target.dataset.originalHeight = target.style.height;
                        target.dataset.originalLeft = target.style.left;
                        target.dataset.originalTop = target.style.top;
                        target.dataset.originalWidth = target.style.width;
                        target.dataset.originalStartMinutes = startMinutes;
                        target.dataset.originalEndMinutes = endMinutes;
                        
                        // Validate timeline after resizing activity
                        try {
                            const timelineKey = target.dataset.timelineKey;
                            if (!timelineKey) {
                                throw new Error('Timeline key not found on activity block');
                            }
                            window.timelineManager.metadata[timelineKey].validate();
                        } catch (error) {
                            console.error('Timeline validation failed:', error);
                            // Revert the change
                            target.dataset.start = target.dataset.originalStart;
                            target.dataset.end = target.dataset.originalEnd;
                            target.dataset.length = target.dataset.originalLength;
                            target.style.left = target.dataset.originalLeft;
                            target.style.width = `${parseFloat(target.dataset.originalLength) * (100 / 1440)}%`;
                            target.classList.add('invalid');
                            setTimeout(() => target.classList.remove('invalid'), 400);
                            return;
                        }
                    }
                }
            },
            end(event) {
                event.target.classList.remove('resizing');
                const textDiv = event.target.querySelector('div[class^="activity-block-text"]');
                const timeLabel = event.target.querySelector('.time-label');
                if (timeLabel) {
                    timeLabel.style.display = 'block';
                }
                if (textDiv) {
                    const length = parseInt(event.target.dataset.length);
                    textDiv.className = getIsMobile()
                        ? (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-narrow')
                        : (length >= 60 ? 'activity-block-text-narrow wide resized' : 'activity-block-text-vertical');
                }
                // Disable autoscroll when resizing ends
                if (window.autoScrollModule) {
                    window.autoScrollModule.disable();
                }
                updateButtonStates();
            }
        }
    });
    
    // Add click and touch handling with debounce
    let lastClickTime = 0;
    const CLICK_DELAY = 300; // milliseconds

    // Unified handler function for both click and touch events
    const handleTimelineInteraction = (e) => {
        console.log('[TIMELINE] Event triggered:', e.type, 'window.selectedActivity:', window.selectedActivity);
        
        // Only process clicks on the active timeline
        if (!targetTimeline || targetTimeline !== window.timelineManager.activeTimeline) {
            console.log('[TIMELINE] Event ignored - not active timeline');
            return;
        }
        
        // Prevent double-clicks
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < CLICK_DELAY) {
            console.log('[TIMELINE] Event ignored - within click delay');
            return;
        }
        lastClickTime = currentTime;

        if (!window.selectedActivity || e.target.closest('.activity-block')) {
            console.log('[TIMELINE] Event ignored - no window.selectedActivity or clicked on activity block');
            return;
        }
        
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
        
        // Get coordinates from either mouse or touch event
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0));
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0));
        
        if (isMobile) {
            const y = clientY - rect.top;
            const clampedY = Math.max(0, Math.min(y, rect.height));
            clickPositionPercent = (clampedY / rect.height) * 100;
        } else {
            const x = clientX - rect.left;
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
        
        // In vertical mode, we only need the start time from the click position
        // End time should always be start time + 10 minutes
        const startMinutes = Math.round(clickMinutes / 10) * 10;
        const endMinutes = startMinutes + 10;

        if (isNaN(startMinutes) || isNaN(endMinutes)) {
            console.error('Invalid minutes calculation:', { startMinutes, endMinutes });
            alert('Cannot place activity here due to invalid position.');
            return;
        }
        
        // Check if activity can be placed at this position
        if (!canPlaceActivity(startMinutes, endMinutes, null)) {
            console.warn('Invalid activity placement attempt:', {
                activity: window.selectedActivity.name,
                startMinutes,
                endMinutes,
                reason: 'Activity cannot be placed at this position due to overlap or timeline bounds'
            });
            const block = document.createElement('div');
            block.className = 'activity-block invalid';
            block.style.backgroundColor = window.selectedActivity.color;
            
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

        // Replace this section with proper time formatting that handles (+1) notation
        const isNextDayStart = startMinutes >= 1440 || startMinutes < 240; // Time is after midnight (1440) or before 04:00 next day
        const formattedStartTime = formatTimeHHMM(startMinutes, false);
        const formattedEndTime = formatTimeHHMM(endMinutes, true);
        
        currentBlock.dataset.start = formattedStartTime;
        currentBlock.dataset.end = formattedEndTime;
        currentBlock.dataset.length = endMinutes - startMinutes;
        currentBlock.dataset.category = window.selectedActivity.category;
        currentBlock.dataset.mode = window.selectedActivity.selections ? 'multiple-choice' : 'single-choice';
        currentBlock.dataset.count = window.selectedActivity.selections ? window.selectedActivity.selections.length : 1;
        currentBlock.dataset.startMinutes = startMinutes;
        currentBlock.dataset.endMinutes = endMinutes;

        // Store parent name if this is a child activity
        if (window.selectedActivity.parentName) {
            currentBlock.dataset.parentName = window.selectedActivity.parentName;
        }

        // Add raw minutes data attributes
        currentBlock.dataset.startMinutes = startMinutes;
        currentBlock.dataset.endMinutes = endMinutes;
        if (window.selectedActivity.selections) {
            // Multiple selections - create split background
            const colors = window.selectedActivity.selections.map(s => s.color);
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
            currentBlock.style.backgroundColor = window.selectedActivity.color;
        }
        const textDiv = document.createElement('div');
        let combinedActivityText;

        if (window.selectedActivity.selections) {
            if (DEBUG_MODE) {
                console.log('Multiple selections:', window.selectedActivity.selections);
            }
            // For multiple selections, join names with line break in the text div
            textDiv.innerHTML = window.selectedActivity.selections.map(s => s.name).join('<br>');
            // But join with vertical separator for storing in timelineManager 
            combinedActivityText = window.selectedActivity.selections.map(s => s.name).join(' | ');
        } else {
            // If this is a child item, display the parent name instead, but store both
            if (window.selectedActivity.parentName) {
                textDiv.textContent = window.selectedActivity.parentName;
                combinedActivityText = window.selectedActivity.name;
            } else {
                textDiv.textContent = window.selectedActivity.name;
                combinedActivityText = window.selectedActivity.name;
            }
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
        
        // Add tooltip to show the selected child item when hovering
        if (window.selectedActivity.parentName) {
            currentBlock.setAttribute('title', `${window.selectedActivity.parentName}: ${window.selectedActivity.name}`);
        }
        
        // Convert minutes to percentage for positioning
        const startPositionPercent = minutesToPercentage(startMinutes);
        const endPositionPercent = minutesToPercentage(endMinutes);
        // Set block size to exactly 10/1440 percentage (10 minutes out of 24 hours)
        let blockSize = (10 / 1440) * 100;  // This equals approximately 0.694444%
        
        // Ensure minimum block width is maintained
        blockSize = Math.max(blockSize, calculateMinimumBlockWidth());
        
        // Adjust end time to match the block size
        const adjustedEndMinutes = startMinutes + 10;

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
            
            // Add original data attributes for mobile/vertical layout
            currentBlock.dataset.originalStart = formattedStartTime;
            currentBlock.dataset.originalEnd = formattedEndTime;
            currentBlock.dataset.originalLength = adjustedEndMinutes - startMinutes;
            currentBlock.dataset.originalHeight = `${blockSize}%`;
            currentBlock.dataset.originalWidth = `${MOBILE_BLOCK_WIDTH}%`;
            currentBlock.dataset.originalTop = `${startPositionPercent}%`;
            currentBlock.dataset.originalLeft = `${MOBILE_OFFSET}%`;
        } else {
            currentBlock.style.width = `${blockSize}%`;
            currentBlock.style.left = `${startPositionPercent}%`;
            currentBlock.style.height = '75%';
            currentBlock.style.top = '25%';
            
            // Update desktop/horizontal layout attributes
            currentBlock.dataset.originalStart = formattedStartTime;
            currentBlock.dataset.originalEnd = formattedEndTime;
            currentBlock.dataset.originalLength = adjustedEndMinutes - startMinutes;
            currentBlock.dataset.originalHeight = '75%';
            currentBlock.dataset.originalWidth = `${blockSize}%`;
            currentBlock.dataset.originalLeft = `${startPositionPercent}%`;
            currentBlock.dataset.originalTop = '25%';
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
        updateTimeLabel(timeLabel, formattedStartTime, formattedEndTime, currentBlock);
        timeLabel.style.display = 'block'; // Ensure the new label is visible

        // Deselect the activity button after successful placement
        document.querySelectorAll('.activity-button').forEach(btn => btn.classList.remove('selected'));
        console.log('[ACTIVITY] Clearing window.selectedActivity after successful placement');
        window.selectedActivity = null;

        const startTime = currentBlock.dataset.start;
        const endTime = currentBlock.dataset.end;
        const times = formatTimeDDMMYYYYHHMM(startTime, endTime);
        if (!times.startTime || !times.endTime) {
            throw new Error('Activity start time and end time must be defined');
        }
        // Get activity name and category from the block's text content and dataset
        const activityText = textDiv.textContent;
        const activityCategory = currentBlock.dataset.category;
            
        // Create activity data with parent name if it exists
        const activityData = {
            id: generateUniqueId(),
            activity: combinedActivityText,
            category: activityCategory,
            startTime: times.startTime,
            endTime: times.endTime,
            blockLength: parseInt(currentBlock.dataset.length),
            color: window.selectedActivity?.color || '#808080',
            count: parseInt(currentBlock.dataset.count) || 1
        };

        // Add parent and selected attributes
        if (currentBlock.dataset.parentName) {
            activityData.parentName = currentBlock.dataset.parentName;
            activityData.selected = combinedActivityText;
        } else {
            // For items without child items, parent and selected are the same
            activityData.parentName = combinedActivityText;
            activityData.selected = combinedActivityText;
        }

        getCurrentTimelineData().push(activityData);
        currentBlock.dataset.id = activityData.id;

        // Validate timeline after adding activity
        try {
            const timelineKey = currentBlock.dataset.timelineKey;
            window.timelineManager.metadata[timelineKey].validate();
        } catch (error) {
            console.error('Timeline validation failed:', error);
            console.warn('Invalid activity placement:', {
                activity: combinedActivityText,
                category: activityCategory,
                timelineKey,
                reason: error.message
            });
            // Remove the invalid activity
            getCurrentTimelineData().pop();
            currentBlock.remove();
            const block = document.createElement('div');
            block.className = 'activity-block invalid';
            block.style.backgroundColor = window.selectedActivity.color;
            block.style.width = currentBlock.style.width;
            block.style.height = currentBlock.style.height;
            block.style.top = currentBlock.style.top;
            block.style.left = currentBlock.style.left;
            targetTimeline.appendChild(block);
            setTimeout(() => block.remove(), 400);
            return;
        }

        updateButtonStates();

        console.log(`[Drag & Resize] Added event listeners for activity block: ${activityData.id}`);

    };

    // Add both click and touch event listeners for better mobile support
    targetTimeline.addEventListener('click', handleTimelineInteraction);
    
    // Add touch events specifically for mobile devices
    if (getIsMobile()) {
        targetTimeline.addEventListener('touchend', (e) => {
            // Prevent the click event from also firing
            e.preventDefault();
            handleTimelineInteraction(e);
        }, { passive: false });
    }

    // Update existing blocks to include parent/selected attributes if they don't have them
    interact('.activity-block').on('resizeend', function(event) {
        const target = event.target;
        
        // If this is an existing block and needs parent/selected attributes
        if (target.dataset.id && !target.hasAttribute('data-selected')) {
            const activityId = target.dataset.id;
            const currentData = getCurrentTimelineData();
            const activityData = currentData.find(a => a.id === activityId);
            
            if (activityData) {
                // If block has parentName but no selected attribute
                if (target.dataset.parentName && !activityData.selected) {
                    // Activity name is stored in dataset or inner text
                    const textDiv = target.querySelector('div[class^="activity-block-text"]');
                    const activityName = textDiv ? textDiv.textContent.trim() : activityData.activity;
                    
                    // Update the data structure
                    activityData.selected = activityData.activity;
                    activityData.parentName = activityName;
                    
                    // Update the block
                    target.setAttribute('title', `${activityName}: ${activityData.activity}`);
                } else if (!activityData.parentName) {
                    // For items without parent, both are the same
                    activityData.parentName = activityData.activity;
                    activityData.selected = activityData.activity;
                }
            }
        }
    });
}

async function init() {
    try {
        // Reinitialize timelineManager with an empty study object
        window.timelineManager = {
            metadata: {},
            activities: {},
            initialized: new Set(),
            activeTimeline: null, // Will be set when first timeline is created
            keys: [],
            currentIndex: 0,
            study: {},
            general: {}
        };

        // Now sync URL parameters so they are stored in timelineManager.study
        syncURLParamsToStudy();

        // (Rest of your initialization code...)
        checkAndRequestPID();
        preventPullToRefresh();

        // Load initial timeline data and do the rest of the setup.
        const response = await fetch('settings/activities.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Save global configuration
        window.timelineManager.general = data.general;

        // Initialize i18n (internationalization) system
        const language = data.general.language || 'en';
        await i18n.init(language);
        
        // Apply translations to existing elements
        i18n.applyTranslations();

        // Handle instructions or redirection if needed.
        if (data.general?.instructions && !new URLSearchParams(window.location.search).has('instructions')) {
            if (!window.location.pathname.includes('/instructions/')) {
                const currentParams = new URLSearchParams(window.location.search);
                const redirectUrl = new URL('pages/instructions.html', window.location.href);
                currentParams.forEach((value, key) => {
                    redirectUrl.searchParams.append(key, value);
                });
                window.location.href = redirectUrl.toString();
                return;
            }
        } else if (window.location.pathname.includes('/instructions/')) {
            const currentParams = new URLSearchParams(window.location.search);
            const redirectUrl = new URL('index.html', window.location.href);
            currentParams.forEach((value, key) => {
                redirectUrl.searchParams.append(key, value);
            });
            window.location.href = redirectUrl.toString();
            return;
        }

        // Initialize timeline management structure with timeline keys
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
        
        // Update gradient bar layout
        updateGradientBarLayout();
        
        // Create and show floating add button for mobile
        createFloatingAddButton();
        if (getIsMobile()) {
            document.querySelector('.floating-add-button').style.display = 'flex';
            updateFloatingButtonPosition();
        }
        
        // Set initial data-mode on activities container
        const activitiesContainerElement = document.querySelector("#activitiesContainer");
        const currentKey = getCurrentTimelineKey();
        if (currentKey && window.timelineManager.metadata[currentKey]) {
            activitiesContainerElement.setAttribute('data-mode', window.timelineManager.metadata[currentKey].mode);
        }
        
        // Scroll to first timeline in mobile layout
        scrollToActiveTimeline();
        
        initButtons();
        
        // Initialize header and footer heights early
        updateHeaderHeight();
        updateFooterHeight();
        
        // Add resize event listener with debounce
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                handleResize();
            }, 100);
        });

        // Add scroll listener to update button position
        window.addEventListener('scroll', () => {
            if (getIsMobile()) {
                updateFloatingButtonPosition();
            }
        });

        // Initialize debug overlay
        initDebugOverlay();

        if (DEBUG_MODE) {
            console.log('Initialized timeline structure:', window.timelineManager);
        }
    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('activitiesContainer').innerHTML = 
            '<p style="color: red;">Error loading activities. Please refresh the page to try again. Error: ' + error.message + '</p>';
    }
}



// Export addNextTimeline, goToPreviousTimeline and renderActivities for ui.js
export { addNextTimeline, goToPreviousTimeline, renderActivities, init };
