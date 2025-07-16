import { 
    getCurrentTimelineData, 
    getCurrentTimelineKey, 
    sendData,
    formatTimeHHMM,
    timeToMinutes,
    generateUniqueId,
    createTimeLabel,
    updateTimeLabel,
    positionToMinutes
} from './utils.js';
import { getIsMobile, updateIsMobile } from './globals.js';
import { addNextTimeline, goToPreviousTimeline, renderActivities } from './script.js';
import { DEBUG_MODE } from './constants.js';

// Modal management
function createModal() {
    // Check if modals already exist
    const existingActivitiesModal = document.getElementById('activitiesModal');
    if (existingActivitiesModal) {
        return existingActivitiesModal;
    }
    
    // Create custom activity input modal
    const customActivityModal = document.createElement('div');
    customActivityModal.className = 'modal-overlay';
    customActivityModal.id = 'customActivityModal';
    customActivityModal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 data-i18n="modals.customActivity.title">Enter Custom Activity</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content">
                <input type="text" id="customActivityInput" maxlength="30" data-i18n-placeholder="modals.customActivity.placeholder" placeholder="Enter your activity (max 30 chars)">
                <div class="button-container">
                    <button id="confirmCustomActivity" class="btn save-btn" data-i18n="buttons.ok">OK</button>
                </div>
            </div>
        </div>
    `;

    customActivityModal.querySelector('.modal-close').addEventListener('click', () => {
        customActivityModal.style.cssText = 'display: none !important';
    });

    customActivityModal.addEventListener('click', (e) => {
        if (e.target === customActivityModal) {
            customActivityModal.style.cssText = 'display: none !important';
        }
    });

    // Create activities modal
    const activitiesModal = document.createElement('div');
    activitiesModal.className = 'modal-overlay';
    activitiesModal.id = 'activitiesModal';
    activitiesModal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 data-i18n="modals.addActivity.title">Add Activity</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div id="modalActivitiesContainer"></div>
        </div>
    `;

    activitiesModal.querySelector('.modal-close').addEventListener('click', () => {
        activitiesModal.style.cssText = 'display: none !important';
    });

    activitiesModal.addEventListener('click', (e) => {
        if (e.target === activitiesModal) {
            activitiesModal.style.cssText = 'display: none !important';
        }
    });

    // NEW: Add event delegation for handling "Other not listed (enter)" clicks
    const modalActivitiesContainer = activitiesModal.querySelector('#modalActivitiesContainer');
    modalActivitiesContainer.addEventListener('click', (e) => {
        if (
            e.target.classList.contains('activity-name') && 
            (e.target.textContent.trim() === 'Other not listed (enter)' || 
             e.target.textContent.trim().includes('Other activities not listed') ||
             e.target.textContent.trim().includes('other time use (please specify)'))
        ) {
            // Hide the activities modal
            activitiesModal.style.cssText = 'display: none !important';
            // Show the custom activity input modal
            const customActivityModal = document.getElementById('customActivityModal');
            if (customActivityModal) {
                customActivityModal.style.display = 'block';
                // Focus the input field for better user experience
                const customActivityInput = document.getElementById('customActivityInput');
                if (customActivityInput) {
                    customActivityInput.focus();
                }
            }
            e.stopPropagation();
        }
    });

    // Create confirmation modal
    const confirmationModal = document.createElement('div');
    confirmationModal.className = 'modal-overlay';
    confirmationModal.id = 'confirmationModal';
    confirmationModal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <h3 data-i18n="modals.confirmSubmit.title">Are you sure?</h3>
                <p data-i18n="modals.confirmSubmit.message">You will not be able to change your responses.</p>
                <div class="button-container">
                    <button id="confirmCancel" class="btn btn-secondary" data-i18n="buttons.cancel">Cancel</button>
                    <button id="confirmOk" class="btn save-btn" data-i18n="buttons.ok">OK</button>
                </div>
            </div>
        </div>
    `;

    confirmationModal.querySelector('#confirmCancel').addEventListener('click', () => {
        confirmationModal.style.cssText = 'display: none !important';
    });

    confirmationModal.querySelector('#confirmOk').addEventListener('click', () => {
        confirmationModal.style.cssText = 'display: none !important';
        showLoadingModal();
        sendData();
        document.getElementById('nextBtn').disabled = true;
    });

    // Create loading modal
    const loadingModal = document.createElement('div');
    loadingModal.className = 'modal-overlay';
    loadingModal.id = 'loadingModal';
    loadingModal.innerHTML = `
        <div class="modal loading-modal">
            <div class="modal-content">
                <div class="loading-spinner"></div>
                <h3 data-i18n="modals.loading.title">Submitting your diary...</h3>
                <p data-i18n="modals.loading.message">Please wait while we save your responses.</p>
            </div>
        </div>
    `;

    document.body.appendChild(activitiesModal);
    document.body.appendChild(confirmationModal);
    document.body.appendChild(loadingModal);
    document.body.appendChild(customActivityModal);
    
    // Apply translations to the newly created modal elements
    if (window.i18n && window.i18n.isReady()) {
        window.i18n.applyTranslations();
    }
    
    return activitiesModal;
}

// Button management
function createFloatingAddButton() {
    // Check if floating button already exists
    const existingButton = document.querySelector('.floating-add-button');
    if (existingButton) {
        return existingButton;
    }
    
    const button = document.createElement('button');
    button.className = 'floating-add-button';
    button.innerHTML = '+';
    button.title = 'Add Activity';
    
    const modal = createModal();
    
    button.addEventListener('click', () => {
        modal.style.display = 'block';
        const currentKey = getCurrentTimelineKey();
        const categories = window.timelineManager.metadata[currentKey].categories;
        renderActivities(categories, document.getElementById('modalActivitiesContainer'));
        
        if (getIsMobile()) {
            const firstCategory = modal.querySelector('.activity-category');
            if (firstCategory) {
                firstCategory.classList.add('active');
            }
        }
    });

    document.body.appendChild(button);
    
    // Initialize the footer and header heights
    updateFooterHeight();
    updateHeaderHeight();
    
    // Add resize observer to update footer height when it changes
    const footer = document.getElementById('instructionsFooter');
    if (footer) {
        const resizeObserver = new ResizeObserver(() => {
            updateFooterHeight();
        });
        resizeObserver.observe(footer);
    }
    
    // Add resize observer to update header height when it changes
    const header = document.querySelector('.header-section');
    if (header) {
        const resizeObserver = new ResizeObserver(() => {
            updateHeaderHeight();
        });
        resizeObserver.observe(header);
    }

    return button;
}

function updateFloatingButtonPosition() {
    if (!getIsMobile()) return;

    const floatingButton = document.querySelector('.floating-add-button');
    const lastTimelineWrapper = document.querySelector('.last-initialized-timeline-wrapper');
    
    if (!floatingButton || !lastTimelineWrapper) return;

    // Get the active timeline container within the wrapper
    const activeTimelineContainer = lastTimelineWrapper.querySelector('.timeline-container');
    if (!activeTimelineContainer) return;

    const containerRect = activeTimelineContainer.getBoundingClientRect();
    const buttonWidth = floatingButton.offsetWidth;
    
    // Position the button 15px to the right of the active timeline container
    const leftPosition = containerRect.right + 15;
    
    // Ensure button doesn't go off screen (leave 10px margin from screen edge)
    const maxLeft = window.innerWidth - buttonWidth - 10;
    const finalLeft = Math.min(leftPosition, maxLeft);
    
    // Only update if the calculated position is valid (not negative)
    if (finalLeft >= 0) {
        floatingButton.style.left = `${finalLeft}px`;
    }
}

function updateButtonStates() {
    const undoButton = document.getElementById('undoBtn');
    const cleanRowButton = document.getElementById('cleanRowBtn');
    const nextButton = document.getElementById('nextBtn');
    const backButton = document.getElementById('backBtn');
    const navSubmitBtn = document.getElementById('navSubmitBtn');
    
    const currentData = getCurrentTimelineData();
    const isEmpty = currentData.length === 0;
    
    // Check if there's an active timeline with activities
    const activeTimeline = window.timelineManager.activeTimeline;
    const hasActivities = activeTimeline && activeTimeline.querySelector('.activity-block');
    
    if (undoButton) undoButton.disabled = isEmpty;
    if (cleanRowButton) cleanRowButton.disabled = !hasActivities;
    
    // Update Back button state - enable if not on first timeline
    if (backButton) {
        backButton.disabled = window.timelineManager.currentIndex <= 0;
    }
    
    // Get current timeline coverage
    const currentKey = getCurrentTimelineKey();
    const currentTimeline = window.timelineManager.metadata[currentKey];
    const currentCoverage = window.getTimelineCoverage();
        
    // Get minimum coverage requirement for current timeline
    const minCoverage = parseInt(currentTimeline.minCoverage) || 0;
    const meetsMinCoverage = currentCoverage >= minCoverage;

    // Check if we're on the last timeline
    const isLastTimeline = window.timelineManager.currentIndex === window.timelineManager.keys.length - 1;
    
    // Get text values for buttons
    const nextText = window.i18n ? window.i18n.t('buttons.next') : 'Next';
    const submitText = window.i18n ? window.i18n.t('buttons.submit') : 'Submit';
    
    if (nextButton) {
        nextButton.disabled = !meetsMinCoverage;
        
        if (isLastTimeline) {
            // On last timeline, show Submit
            nextButton.innerHTML = `<i class="fas fa-check"></i> ${submitText}`;
        } else {
            // For other timelines, show Next
            nextButton.innerHTML = `${nextText} <i class="fas fa-arrow-right"></i>`;
        }
    }
    
    // Update navSubmitBtn to mirror nextButton exactly
    if (navSubmitBtn) {
        navSubmitBtn.disabled = !meetsMinCoverage;
        
        // Find the span element inside navSubmitBtn
        const navSubmitSpan = navSubmitBtn.querySelector('span');
        
        if (isLastTimeline) {
            // On last timeline, show Submit with green color
            if (navSubmitSpan) {
                navSubmitSpan.textContent = submitText;
            }
            navSubmitBtn.classList.add('submit-mode');
        } else {
            // For other timelines, show Next with blue color
            if (navSubmitSpan) {
                navSubmitSpan.textContent = nextText;
            }
            navSubmitBtn.classList.remove('submit-mode');
        }
    }
}

// Shared debounce variables for both Next button and navigation submit button
let nextButtonLastClick = 0;
const NEXT_BUTTON_COOLDOWN = 2500; // 2.5 second cooldown

// Debounce variables for Back button
let backButtonLastClick = 0;
const BACK_BUTTON_COOLDOWN = 1500; // 1.5 second cooldown (shorter than Next)

// Shared function to handle Next button logic with debounce
const handleNextButtonAction = () => {
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
        window.selectedActivity = null;
    }
};

// Shared function to handle Back button logic with debounce
const handleBackButtonAction = () => {
    const currentTime = Date.now();
    if (currentTime - backButtonLastClick < BACK_BUTTON_COOLDOWN) {
        console.log('Back button on cooldown');
        return;
    }
    backButtonLastClick = currentTime;

    if (window.timelineManager.currentIndex > 0) {
        goToPreviousTimeline();
    }
};

function initButtons() {
    const cleanRowBtn = document.getElementById('cleanRowBtn');
    const navSubmitBtn = document.getElementById('navSubmitBtn');

    // Initialize the navigation submit button with proper debounce
    if (navSubmitBtn) {
        navSubmitBtn.addEventListener('click', () => {
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn && !nextBtn.disabled) {
                // Use the shared debounced function instead of programmatic click
                handleNextButtonAction();
            }
        });
    }

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

    // Add click handler for Next button using shared debounced function
    document.getElementById('nextBtn').addEventListener('click', handleNextButtonAction);

    // Add click handler for Back button using shared debounced function
    document.getElementById('backBtn').addEventListener('click', handleBackButtonAction);

    // Disable back button initially
    const backButton = document.getElementById('backBtn');
    if (backButton) {
        backButton.disabled = true;
    }
}

// Debug overlay functions
function updateDebugOverlay(mouseX, mouseY, timelineRect) {
    const debugOverlay = document.getElementById('debugOverlay');
    if (!debugOverlay) return;

    const isMobile = getIsMobile();
    
    // In mobile mode, if no timelineRect is provided, get it from active timeline
    if (isMobile && !timelineRect) {
        const activeTimeline = window.timelineManager.activeTimeline;
        if (!activeTimeline) return;
        timelineRect = activeTimeline.getBoundingClientRect();
    }
    
    let positionPercent, axisPosition, axisSize;

    // Get viewport and header dimensions
    const viewportHeight = window.innerHeight;
    const headerSection = document.querySelector('.header-section');
    const headerBottom = headerSection ? headerSection.getBoundingClientRect().bottom : 0;
    
    // Calculate available height (space between header bottom and viewport bottom)
    const availableHeight = viewportHeight - headerBottom;

    // Calculate normalized distances relative to available height
    const distanceToBottom = (viewportHeight - mouseY) / availableHeight;
    const distanceToHeader = (mouseY - headerBottom) / availableHeight;

    if (isMobile) {
        // Vertical layout calculations
        const relativeY = mouseY - timelineRect.top;
        positionPercent = (relativeY / timelineRect.height) * 100;
        axisPosition = Math.round(relativeY);
        axisSize = Math.round(timelineRect.height);
    } else {
        // Horizontal layout calculations
        const relativeX = mouseX - timelineRect.left;
        positionPercent = (relativeX / timelineRect.width) * 100;
        axisPosition = Math.round(relativeX);
        axisSize = Math.round(timelineRect.width);
    }

    const minutes = positionToMinutes(positionPercent, isMobile);
    // Format time - no need to adjust minutes since formatTimeHHMM now handles the offset
    const timeString = formatTimeHHMM(minutes);

    debugOverlay.innerHTML = isMobile
        ? `Mouse Position: ${axisPosition}px<br>
           Timeline Height: ${axisSize}px<br>
           Position: ${positionPercent.toFixed(2)}%<br>
           Time: ${timeString}<br>
           Distance to Bottom: ${distanceToBottom.toFixed(3)}<br>
           Distance to Header: ${distanceToHeader.toFixed(3)}`
        : `Mouse Position: ${axisPosition}px<br>
           Timeline Width: ${axisSize}px<br>
           Position: ${positionPercent.toFixed(2)}%<br>
           Time: ${timeString}<br>
           Distance to Bottom: ${distanceToBottom.toFixed(3)}<br>
           Distance to Header: ${distanceToHeader.toFixed(3)}`;
}

// Initialize continuous debug overlay updates for mobile layout
function initDebugOverlay() {
    if (!DEBUG_MODE) return;

    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 50; // Update every 50ms

    // Function to handle both mouse and touch events
    const handleMove = (e) => {
        const currentTime = Date.now();
        if (getIsMobile() && currentTime - lastUpdateTime > UPDATE_INTERVAL) {
            // Get coordinates from either mouse or touch event
            const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            updateDebugOverlay(x, y);
            lastUpdateTime = currentTime;
        }
    };

    // Add both mouse and touch event listeners
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
}

function hideDebugOverlay() {
    const debugOverlay = document.getElementById('debugOverlay');
    if (debugOverlay) {
        debugOverlay.innerHTML = '';
    }
}

function updateGradientBarLayout() {
    const gradientBar = document.querySelector('.gradient-bar');
    if (gradientBar) {
        gradientBar.setAttribute('data-layout', getIsMobile() ? 'vertical' : 'horizontal');
    }
}

// Helper function to scroll to active timeline
function scrollToActiveTimeline() {
    if (!window.timelineManager.activeTimeline) return;
    
    const activeTimeline = window.timelineManager.activeTimeline.closest('.timeline-container');
    if (!activeTimeline) return;

    if (getIsMobile()) {
        // Mobile: horizontal scroll
        const timelinesWrapper = document.querySelector('.timelines-wrapper');
        if (timelinesWrapper) {
            // Check if wrapper has scrollable overflow
            const hasScrollableOverflow = timelinesWrapper.scrollWidth > timelinesWrapper.clientWidth;
            
            if (hasScrollableOverflow) {
                // Calculate if timeline is partially or fully hidden
                const timelineRect = activeTimeline.getBoundingClientRect();
                const wrapperRect = timelinesWrapper.getBoundingClientRect();
                
                // Check if timeline is not fully visible
                const isPartiallyHidden = 
                    timelineRect.left < wrapperRect.left ||
                    timelineRect.right > wrapperRect.right;
                
                if (isPartiallyHidden) {
                    // Scroll to make timeline fully visible
                    timelinesWrapper.scrollTo({
                        left: activeTimeline.offsetLeft,
                        behavior: 'smooth'
                    });
                }
            }
        }
    } else {
        // Desktop: vertical scroll to center
        const windowHeight = window.innerHeight;
        const timelineRect = activeTimeline.getBoundingClientRect();
        const scrollTarget = window.pageYOffset + timelineRect.top - (windowHeight / 2) + (timelineRect.height / 2);
        
        window.scrollTo({
            top: scrollTarget,
            behavior: 'smooth'
        });
    }
}

function updateTimelineCountVariable() {
    const pastTimelinesWrapper = document.querySelector('.past-initialized-timelines-wrapper');
    if (!pastTimelinesWrapper) return;
    
    const timelineCount = pastTimelinesWrapper.querySelectorAll('.timeline-container').length;
    pastTimelinesWrapper.style.setProperty('--timeline-count', timelineCount);
}

// Prevent pull-to-refresh on mobile devices
function preventPullToRefresh() {
    // Only prevent overscroll on iOS Safari and Chrome
    document.body.style.overscrollBehavior = 'none';
    
    // For iOS Safari - only prevent default when at the top of the page and pulling down
    document.addEventListener('touchstart', function(e) {
        // Store the initial touch position
        window.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        const touchY = e.touches[0].clientY;
        const touchYDelta = touchY - window.touchStartY;
        
        // Only prevent default if we're at the top and trying to pull down
        if (window.pageYOffset === 0 && touchYDelta > 0) {
            e.preventDefault();
        }
    }, { passive: false });
}

function updateFooterHeight() {
    const footer = document.getElementById('instructionsFooter');
    if (footer) {
        const footerHeight = footer.offsetHeight;
        document.documentElement.style.setProperty('--footer-height', `${footerHeight}px`);
    }
}

function updateHeaderHeight() {
    const header = document.querySelector('.header-section');
    if (header) {
        const headerHeight = header.offsetHeight;
        document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    }
}

function handleResize() {
    // updateIsMobile will now handle the reload at breakpoint
    updateIsMobile();
    // Update floating button position, header height, and footer height
    updateFloatingButtonPosition();
    updateHeaderHeight();
    updateFooterHeight();
}

// Loading modal functions
function showLoadingModal() {
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal) {
        loadingModal.style.display = 'block';
    }
}

function hideLoadingModal() {
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal) {
        loadingModal.style.cssText = 'display: none !important';
    }
}

// Initialize UI components
export { 
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
    updateFooterHeight,
    updateHeaderHeight,
    showLoadingModal,
    hideLoadingModal
};
