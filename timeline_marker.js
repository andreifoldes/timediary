import { DEBUG_MODE } from './constants.js';

export class TimelineMarker {
    constructor(type, position, label = '') {
        this.type = type; // 'hour', 'minute-30', 'minute-10'
        this.position = position; // percentage position
        this.label = label;
        this.element = null;
    }

    create(timeline, isMobile) {
        this.element = document.createElement('div');
        
        // Set marker class
        if (this.type === 'minute-marker-30') {
            this.element.className = 'minute-marker-30';
        } else if (this.type === 'minute') {
            this.element.className = 'minute-marker';
        } else {
            this.element.className = `${this.type}-marker`;
        }

        // Ensure position is within bounds (0-100%)
        const normalizedPosition = Math.max(0, Math.min(100, this.position));

        if (isMobile) {
            // In mobile mode, scale position to fit within timeline height
            const scaledPosition = (normalizedPosition / 100) * 100;
            this.element.style.top = `${scaledPosition}%`;
        } else {
            this.element.style.left = `${normalizedPosition}%`;
        }

        if (this.type === 'hour') {
            const labelElement = document.createElement('div');
            labelElement.className = 'hour-label';
            labelElement.textContent = this.label;
            this.element.appendChild(labelElement);
        }

        // Get or create markers container
        let markersContainer = timeline.querySelector('.markers');
        if (!markersContainer) {
            markersContainer = document.createElement('div');
            markersContainer.className = 'markers';
            timeline.appendChild(markersContainer);
        }
        markersContainer.appendChild(this.element);
        
        // If this is an hour marker, move the label to timeline-container
        if (this.type === 'hour') {
            const label = this.element.querySelector('.hour-label');
            if (label) {
                this.element.removeChild(label);
                // Get hour-labels container from timeline-container
                let hourLabelsContainer = timeline.parentElement.querySelector('.hour-labels');
                if (!hourLabelsContainer) {
                    hourLabelsContainer = document.createElement('div');
                    hourLabelsContainer.className = 'hour-labels';
                    timeline.parentElement.appendChild(hourLabelsContainer);
                }
                
                // Create label wrapper for each hour marker
                const labelWrapper = document.createElement('div');
                labelWrapper.className = 'hour-label-wrapper';
                labelWrapper.style.position = 'absolute';
                
                // Calculate correct position based on layout
                if (isMobile) {
                    // In mobile mode, position is based on percentage of 24 hours
                    const hour = parseInt(this.label.split(':')[0]);
                    // Adjust for timeline starting at 4am
                    const adjustedHour = (hour < 4) ? hour + 24 : hour;
                    const position = ((adjustedHour - 4) / 24) * 100;
                    labelWrapper.style.top = `${position}%`;
                    labelWrapper.style.left = ''; // Clear left position
                } else {
                    labelWrapper.style.left = this.element.style.left;
                    labelWrapper.style.top = ''; // Clear top position
                }
                
                labelWrapper.appendChild(label);
                hourLabelsContainer.appendChild(labelWrapper);

                // Add an extra wrapper at 100% position when we reach the last marker (desktop mode only)
                if (this.label === '03:00' && !isMobile) {
                    const extraWrapper = document.createElement('div');
                    extraWrapper.className = 'hour-label-wrapper';
                    extraWrapper.style.position = 'absolute';
                    extraWrapper.style.left = '100%';
                    const extraLabel = document.createElement('div');
                    extraLabel.className = 'hour-label';
                    extraLabel.textContent = '04:00';
                    extraWrapper.appendChild(extraLabel);
                    hourLabelsContainer.appendChild(extraWrapper);
                }
            }
        }

        
        return this.element;
    }

    update(isMobile) {
        if (isMobile) {
            this.element.style.top = `${this.position}%`;
            this.element.style.left = '';
            
            // Update hour label wrapper position if this is an hour marker
            if (this.type === 'hour') {
                const timeline = this.element.closest('.timeline');
                const hourLabelsContainer = timeline?.parentElement.querySelector('.hour-labels');
                if (hourLabelsContainer) {
                    // Find label by hour text instead of position
                    const hour = parseInt(this.label.split(':')[0]);
                    const adjustedHour = (hour < 4) ? hour + 24 : hour;
                    const position = ((adjustedHour - 4) / 24) * 100;
                    // Find label wrapper by iterating through wrappers
                    const labelWrappers = hourLabelsContainer.querySelectorAll('.hour-label-wrapper');
                    for (const wrapper of labelWrappers) {
                        const label = wrapper.querySelector('.hour-label');
                        if (label && label.textContent === this.label) {
                            wrapper.style.top = `${position}%`;
                            wrapper.style.left = '';
                            break;
                        }
                    }
                }
            }
        } else {
            this.element.style.left = `${this.position}%`;
            this.element.style.top = '';
            
            // Update hour label wrapper position if this is an hour marker
            if (this.type === 'hour') {
                const timeline = this.element.closest('.timeline');
                const hourLabelsContainer = timeline?.parentElement.querySelector('.hour-labels');
                if (hourLabelsContainer) {
                    // Find label wrapper by iterating through wrappers
                    const labelWrappers = hourLabelsContainer.querySelectorAll('.hour-label-wrapper');
                    for (const wrapper of labelWrappers) {
                        const label = wrapper.querySelector('.hour-label');
                        if (label && label.textContent === this.label) {
                            wrapper.style.left = `${this.position}%`;
                            wrapper.style.top = '';
                            break;
                        }
                    }
                }
            }
        }
    }
}
