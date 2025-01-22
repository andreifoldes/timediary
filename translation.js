export let currentTranslations = {};
export const fallbackLang = 'en';

async function loadTranslations(lang = fallbackLang) {
    try {
        const response = await fetch('/language.json');
        const allTranslations = await response.json();
        currentTranslations = mergeTranslations(allTranslations[lang], allTranslations[fallbackLang]);
        applyTranslations();
    } catch (error) {
        console.error('Error loading translations:', error);
    }
}

export function mergeTranslations(primary, fallback) {
    const deepMerge = (target, source) => {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                deepMerge(target[key], source[key]);
            } else if (!target[key]) {
                target[key] = source[key];
            }
        }
        return target;
    };
    return deepMerge(JSON.parse(JSON.stringify(primary || {})), fallback);
}

function applyTranslations() {
    // Static text translations
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const keys = el.dataset.i18n.split('.');
        let value = currentTranslations;
        keys.forEach(k => value = value?.[k]);
        if (value) el.textContent = value;
    });

    // Dynamic attribute translations
    document.querySelectorAll('[data-i18n-attrs]').forEach(el => {
        const attributes = JSON.parse(el.dataset.i18nAttrs);
        Object.entries(attributes).forEach(([attr, key]) => {
            const keys = key.split('.');
            let value = currentTranslations;
            keys.forEach(k => value = value?.[k]);
            if (value) el.setAttribute(attr, value);
        });
    });
}

export const i18n = (key, params = {}) => {
window.i18n = i18n; // Also maintain global access for HTML attributes
    const keys = key.split('.');
    let value = currentTranslations;
    keys.forEach(k => value = value?.[k]);
    
    if (typeof value === 'string') {
        return Object.entries(params).reduce((str, [k, v]) => 
            str.replace(new RegExp(`{${k}}`, 'g'), v), value);
    }
    return value || key;
};

