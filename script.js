let youtubeAPIReady = false;
const videoInitializationQueue = [];

window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API is ready!');
    youtubeAPIReady = true;
    while (videoInitializationQueue.length > 0) {
        const videoData = videoInitializationQueue.shift();
        initializeYouTubePlayer(videoData);
    }
};


document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('contentArea');
    const buttons = document.querySelectorAll('.option-btn');
    const themeInput = document.getElementById('themeInput');

    const mainContainer = document.querySelector('.container');

    const memeNotification = document.getElementById('memeNotification');
    const notificationMessage = document.getElementById('notificationMessage');
    const notificationSpinner = document.getElementById('notificationSpinner');
    const notificationDismiss = document.getElementById('notificationDismiss');
    const btnMemes = document.getElementById('btnMemes');

    let twitterWidgetsLoaded = false;

    const youtubePlayers = {};

    let currentPlayingVideoPlayer = null;
    let videoIntersectionObserver = null;

    let isGloballyMuted = true;

    let allThemesContentData = {};

    const loadedCategoriesPerTheme = {};

    let currentThemeKey;

    let isPostingsInitialRender = false;
    let postingsReclickTimeoutId = null;
    let isPostingsLoadingOverlayActive = false;

    const MEMES_TO_GENERATE_BATCH = 4;

    const loadingMessages = {
        memes: {
            searching: "Durchsuche die Datenbank nach vorhandenen Memes...",
            notFoundPrompt: "Zu diesem Thema wurden leider keine Memes gefunden. Möchtest du, dass ich Memes dazu erstelle?",
            creating: "Erstelle Memes zum Thema Weltraumtourismus. Dies kann einige Sekunden dauern, sieh dir daher inzwischen die anderen Kategorien dieser Website durch. Du bekommst eine Nachricht, sobald sie fertig sind.",
            creating2: "Erstelle Memes",
	        askAgain: "Soll ich noch ein Meme erstellen?",
	        allShown: ""
        },
        videos: [
            "Suche nach Kurzvideos.",
            "Füge auch englische Videos hinzu."
        ],
        postings: {
            searching: "Durchstöbere X (Twitter) nach aktuellen Beiträgen...",
            translating: "Übersetze Beiträge...",
            loadingEmbeds: "X (Twitter) wird nach Beiträgen durchsucht."
        },
        zeitungsartikel: "Scanne Online-Archive nach relevanten Zeitungsartikel...",
        chatbot: "Verbinde mit dem Experten für Weltraumtourismus..."
    };

    let currentMainLoadingTimeoutId = null;
    let memeGenerationTimeoutId = null;
    let generatedMemeBuffer = [];
    let lastDisplayedMemeBatch = [];
    let isMemeGenerationActive = false;
	
    let memesArrayForGeneration = [];

    let totalVideosExpected = 0;
    let videosReadyCount = 0;
    let allVideosReadyConsoleLogged = false;
    let videoContentWrapperElement = null;
    let videoCategoryClickTime = 0;


    function showLoadingScreen(category, messageType = 'searching') {
        window.scrollTo({ top: 0, behavior: 'instant' });

        let message;
        if (category === 'memes' && typeof loadingMessages.memes === 'object') {
            message = loadingMessages.memes[messageType];
        } else if (category === 'postings' && typeof loadingMessages.postings === 'object') {
            message = loadingMessages.postings[messageType];
        } else if (Array.isArray(loadingMessages[category])) {
            message = loadingMessages[category][0];
        } else {
            message = loadingMessages[category];
        }

        contentArea.innerHTML = `
            <div class="loading-overlay">
                <div class="spinner"></div>
                <p id="loadingMessageText" class="loading-message">${message || "Wird geladen..."}</p>
            </div>
        `;
        resetContentAreaStyles();
    }

    function showMemeNotification(message, type = 'info', clickable = false) {
        notificationMessage.textContent = message;
        memeNotification.className = `meme-notification ${type}`;

        if (type === 'loading') {
            notificationSpinner.style.display = 'block';
        } else {
            notificationSpinner.style.display = 'none';
        }

        if (clickable) {
            memeNotification.style.cursor = 'pointer';
            notificationMessage.style.textDecoration = 'underline';
            memeNotification.onclick = () => {
                if (btnMemes) {
                    btnMemes.click();
                }
                hideMemeNotification();
            };
        } else {
            memeNotification.style.cursor = 'default';
            notificationMessage.style.textDecoration = 'none';
            memeNotification.onclick = null;
        }

        memeNotification.classList.remove('hidden');
    }

    function hideMemeNotification() {
        memeNotification.classList.add('hidden');
        memeNotification.onclick = null;
    }


    notificationDismiss.addEventListener('click', (event) => {
        event.stopPropagation();
        hideMemeNotification();
    });


    function loadTwitterWidgets(targetElement) {
        // Ensure the overlay is shown before starting widget load, in case it was hidden by some earlier logic.
        // It won't create a new one if already active due to isPostingsLoadingOverlayActive flag.
        showOverlayLoadingSpinner('postings', 'loadingEmbeds'); 

        const finishLoading = (success) => {
            if (isPostingsInitialRender && targetElement.id === 'contentArea') {
                // This indicates a potential premature resolution by twttr.widgets.load()
                // Do NOT hide the spinner yet. The re-click will trigger a new loading phase,
                // and showOverlayLoadingSpinner will be called again, keeping it visible.
                console.warn(`%c[Twitter Embeds] Premature ${success ? 'success' : 'error'} detected for initial postings load. Triggering re-click.`, 'color: orange; font-weight: bold;');
                
                isPostingsInitialRender = false; // Reset the flag after scheduling the re-click
                if (postingsReclickTimeoutId) clearTimeout(postingsReclickTimeoutId);
                postingsReclickTimeoutId = setTimeout(() => {
                    const btn = document.getElementById('btnPostings');
                    if (btn) {
                        btn.click();
                        console.log(`%c[Twitter Embeds] btnPostings re-clicked automatically due to ${success ? 'premature success' : 'error'}.`, 'color: #1DA1F2;');
                    }
                    postingsReclickTimeoutId = null;
                }, 1000); // Give a bit more time before re-clicking
            } else {
                // If it's not the initial render, or if the initial render completed successfully
                // without needing a re-click (which is less common with Twitter embeds),
                // then hide the spinner after a small delay to allow visual rendering to catch up.
                setTimeout(() => {
                    hideOverlayLoadingSpinner();
                    const logMessage = `All Twitter embeds in element ${targetElement.id || targetElement.tagName} have finished loading (after potential delay).`;
                    console.log(`%c[Twitter Embeds] ${logMessage}`, 'color: #1DA1F2; font-weight: bold;');
                }, 500); // Add a small delay to ensure visual rendering
            }
        };

        if (window.twttr && window.twttr.widgets) {
            console.log(`%c[Twitter Embeds] Attempting to load embeds via twttr.widgets.load(). Target: ${targetElement.id || targetElement.tagName}.`, 'color: #1DA1F2;');
            window.twttr.widgets.load(targetElement)
                .then(() => {
                    finishLoading(true);
                })
                .catch(error => {
                    console.error(`%c[Twitter Embeds] Error loading Twitter embeds in element ${targetElement.id || targetElement.tagName}:`, 'color: red; font-weight: bold;', error);
                    finishLoading(false);
                });
        } else if (!twitterWidgetsLoaded) {
            console.log(`%c[Twitter Embeds] Twitter widgets.js not yet loaded. Appending script.`, 'color: #1DA1F2;');
            const script = document.createElement('script');
            script.src = "https://platform.twitter.com/widgets.js";
            script.async = true;
            script.charset = "utf-8";
            script.onload = () => {
                console.log(`%c[Twitter Embeds] widgets.js script loaded.`, 'color: #1DA1F2;');
                if (window.twttr && window.twttr.widgets) {
                    console.log(`%c[Twitter Embeds] Attempting to load embeds via twttr.widgets.load() (after script load). Target: ${targetElement.id || targetElement.tagName}.`, 'color: #1DA1F2;');
                    window.twttr.widgets.load(targetElement)
                        .then(() => {
                            finishLoading(true);
                        })
                        .catch(error => {
                            console.error(`%c[Twitter Embeds] Error loading Twitter embeds (after script load) in element ${targetElement.id || targetElement.tagName}:`, 'color: red; font-weight: bold;', error);
                            finishLoading(false);
                        });
                } else {
                    console.error(`%c[Twitter Embeds] twttr.widgets not available after script load, something went wrong.`, 'color: red;');
                    finishLoading(false); // Treat as error
                }
            };
            script.onerror = () => {
                console.error(`%c[Twitter Embeds] Failed to load Twitter widgets.js script from ${script.src}.`, 'color: red; font-weight: bold;');
                finishLoading(false); // Treat as error
            };
            document.body.appendChild(script);
            twitterWidgetsLoaded = true;
        } else {
            console.log(`%c[Twitter Embeds] twttr.widgets already loaded and script previously appended. Skipping.`, 'color: grey;');
            // If widgets are already loaded and we're skipping, just hide the overlay
            // with a slight delay.
            setTimeout(() => {
                hideOverlayLoadingSpinner();
            }, 500);
        }
    }

    function showOverlayLoadingSpinner(category, messageType = 'loadingEmbeds') {
        if (isPostingsLoadingOverlayActive) {
            const existingMessageElement = contentArea.querySelector('#loadingOverlayText');
            if (existingMessageElement) {
                existingMessageElement.textContent = loadingMessages[category][messageType] || "Wird geladen...";
            }
            console.log(`%c[Loading Overlay] Overlay already active, updating message for category: ${category}.`, 'color: grey;');
            return;
        }

        console.log(`%c[Loading Overlay] Showing overlay loading spinner for category: ${category}, message: ${loadingMessages[category][messageType]}.`, 'color: #007bff;');

        const overlayDiv = document.createElement('div');
        overlayDiv.classList.add('loading-overlay-posts');
        overlayDiv.style.position = 'absolute';
        overlayDiv.style.top = '0';
        overlayDiv.style.left = '0';
        overlayDiv.style.width = '100%';
        overlayDiv.style.height = '100%';
        overlayDiv.style.backgroundColor = '#e9ecef'; // Ensure opaque background
        overlayDiv.style.display = 'flex';
        overlayDiv.style.flexDirection = 'column';
        overlayDiv.style.justifyContent = 'flex-start';
        overlayDiv.style.alignItems = 'center';
        overlayDiv.style.zIndex = '1000'; // Increased z-index to ensure visibility
        overlayDiv.style.borderRadius = '8px';
        overlayDiv.style.padding = '0';

        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('loading-content-wrapper');

        contentWrapper.innerHTML = `
            <div class="spinner"></div>
            <p id="loadingOverlayText" class="loading-message">${loadingMessages[category][messageType] || "Wird geladen..."}</p>
        `;
        overlayDiv.appendChild(contentWrapper);

        contentArea.appendChild(overlayDiv);
        isPostingsLoadingOverlayActive = true;
    }

    function hideOverlayLoadingSpinner() {
        const overlay = contentArea.querySelector('.loading-overlay-posts');
        if (overlay) {
            console.log(`%c[Loading Overlay] Hiding overlay loading spinner.`, 'color: #007bff;');
            overlay.remove();
            isPostingsLoadingOverlayActive = false;
        } else if (isPostingsLoadingOverlayActive) {
             console.warn(`%c[Loading Overlay] Tried to hide overlay, but no element found, yet isPostingsLoadingOverlayActive was true. Resetting flag.`, 'color: orange;');
             isPostingsLoadingOverlayActive = false;
        } else {
            console.log(`%c[Loading Overlay] No overlay loading spinner to hide.`, 'color: grey;');
        }
    }


    function shuffleArray(array) {
        const shuffledArray = [...array];
        for (let i = shuffledArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
        }
        return shuffledArray;
    }

    function resetContentAreaStyles() {
        contentArea.style.minHeight = '300px';
        contentArea.style.padding = '25px';
        contentArea.style.border = '1px solid #ced4da';
        contentArea.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
        contentArea.style.backgroundColor = '#e9ecef';
        contentArea.style.borderRadius = '8px';
        contentArea.style.overflowY = 'auto';
        contentArea.classList.remove('video-mode');
        contentArea.classList.remove('chatbot-mode');
        contentArea.style.position = 'relative'; // Ensure contentArea is positioned for absolute overlay

        if (videoIntersectionObserver) {
            videoIntersectionObserver.disconnect();
            videoIntersectionObserver = null;
        }
        Object.values(youtubePlayers).forEach(player => {
            if (player && typeof player.destroy === 'function') {
                try {
                    player.destroy();
                } catch (e) {
                    console.error("Error destroying YouTube player:", e);
                }
            }
        });
        for (const key in youtubePlayers) {
            if (youtubePlayers.hasOwnProperty(key)) {
                delete youtubePlayers[key];
            }
        }
        currentPlayingVideoPlayer = null;
        videoContentWrapperElement = null;
        videoCategoryClickTime = 0;
        
        hideOverlayLoadingSpinner();
    }

    const volumeUpSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.98 7-4.66 7-8.77s-2.99-7.79-7-8.77z"/></svg>`;
    const volumeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .96-.24 1.86-.65 2.68l1.66 1.66C21.23 14.6 22 13.31 22 12c0-4.07-3.05-7.44-7-8.77v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71zM4.27 3L3 4.27l4.98 4.98L3 12v6h4l5 5V12.72L19.73 21 21 19.73 12.27 11 4.27 3zM10 15.27V12.73L12.42 15.15l-2.42.12z"/></svg>`;


    function toggleMute(player, buttonElement) {
        if (player.isMuted()) {
            player.unMute();
            player.setVolume(10);
            buttonElement.innerHTML = volumeUpSvg;
            isGloballyMuted = false;
        } else {
            player.mute();
            buttonElement.innerHTML = volumeOffSvg;
            isGloballyMuted = true;
        }
    }

    function showMemeGenerationPrompt() {
        const promptWrapper = document.createElement('div');
        promptWrapper.style.textAlign = 'center';
        promptWrapper.style.marginTop = '20px';
        promptWrapper.style.padding = '20px';
        promptWrapper.style.backgroundColor = '#f8f9fa';
        promptWrapper.style.border = '1px solid #dee2e6';
        promptWrapper.style.borderRadius = '8px';
        promptWrapper.style.boxShadow = '0 4px 8px rgba(0,0,0,0.05)';
        promptWrapper.style.maxWidth = '400px';
        promptWrapper.style.margin = '20px auto';

        const promptParagraph = document.createElement('p');
        promptParagraph.style.fontSize = '1.1em';
        promptParagraph.style.marginBottom = '20px';
        promptParagraph.textContent = loadingMessages.memes.notFoundPrompt;
        promptWrapper.appendChild(promptParagraph);

        const generateButton = document.createElement('button');
        generateButton.textContent = "Ja, bitte";
        generateButton.classList.add('option-btn');
        generateButton.style.padding = '15px 35px';
        generateButton.style.fontSize = '1.3em';
        generateButton.style.fontWeight = 'bold';
        generateButton.style.minWidth = '150px';

        generateButton.addEventListener('click', () => {
            if (!isMemeGenerationActive) {
                startMemeGenerationProcess();
            }
        });
        promptWrapper.appendChild(generateButton);

        contentArea.innerHTML = '';
        contentArea.appendChild(promptWrapper);
    }

    function startMemeGenerationProcess() {
        if (isMemeGenerationActive) {
            console.log("Meme generation already active. Ignoring request.");
            return;
        }

        isMemeGenerationActive = true;
        showLoadingScreen('memes', 'creating');
        showMemeNotification(loadingMessages.memes.creating2, 'loading');

        if (!allThemesContentData[currentThemeKey] || !allThemesContentData[currentThemeKey].memes) {
            console.error("Meme-Daten sind für das aktuelle Thema nicht verfügbar.");
            isMemeGenerationActive = false;
            hideMemeNotification();
            contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">Es konnten keine Memes geladen werden.</p>`;
            return;
        }

        if (memesArrayForGeneration.length === 0 && allThemesContentData[currentThemeKey].memes.length > 0) {
            memesArrayForGeneration = shuffleArray([...allThemesContentData[currentThemeKey].memes]);
        }
        
        generatedMemeBuffer = [];

        const memesToGenerateInBatch = Math.min(MEMES_TO_GENERATE_BATCH, memesArrayForGeneration.length);
        for (let i = 0; i < memesToGenerateInBatch; i++) {
            generatedMemeBuffer.push(memesArrayForGeneration.shift());
        }

        if (memeGenerationTimeoutId) {
            clearTimeout(memeGenerationTimeoutId);
        }

        memeGenerationTimeoutId = setTimeout(() => {
            isMemeGenerationActive = false;
            memeGenerationTimeoutId = null;

            if (generatedMemeBuffer.length > 0) {
                lastDisplayedMemeBatch = [...generatedMemeBuffer];
                showMemeNotification("Deine Memes sind fertig!", 'success', true);
            } else {
                lastDisplayedMemeBatch = [];
                showMemeNotification(loadingMessages.memes.allShown, 'info', false);
            }
            
            memesArrayForGeneration = [];
            generatedMemeBuffer = [];

            const currentLoadingMessageElement = contentArea.querySelector('#loadingMessageText');
            if (currentLoadingMessageElement && currentLoadingMessageElement.textContent.includes(loadingMessages.memes.creating)) { 
                contentArea.innerHTML = ''; 

                if (lastDisplayedMemeBatch.length > 0) {
                    lastDisplayedMemeBatch.forEach(meme => {
                        const memeDiv = document.createElement('div');
                        memeDiv.classList.add('content-item', 'generated-meme');
                        memeDiv.innerHTML = `
                            <h3>${meme.title}</h3>
                            <img src="${meme.image}" alt="${meme.title}" style="max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 4px;">
                        `;
                        contentArea.appendChild(memeDiv);
                    });
                }
                
                const allShownMessageDiv = document.createElement('div');
                allShownMessageDiv.style.textAlign = 'center';
                allShownMessageDiv.style.marginTop = '20px';
                allShownMessageDiv.innerHTML = `<p>${loadingMessages.memes.allShown}</p>`;
                contentArea.appendChild(allShownMessageDiv);
                
                hideMemeNotification();
            } else {
                console.log("Memes generated in background, waiting for user to return to Memes category.");
            }
        }, 4000);
    }

    function extractTweetText(htmlString) {
        if (!htmlString) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const pTag = doc.querySelector('blockquote.twitter-tweet p');
        if (pTag) {
            const clone = pTag.cloneNode(true);
            clone.querySelectorAll('a').forEach(a => a.remove());
            return clone.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/&amp;/g, '&').trim();
        }
        return '';
    }

    function renderPostings(useTranslated) {
        console.log(`%c[Postings] Rendering postings (translated: ${useTranslated}).`, 'color: #007bff;');
        contentArea.innerHTML = '';

        if (!allThemesContentData[currentThemeKey] || !allThemesContentData[currentThemeKey].postings) {
            console.error("Postings-Daten sind für das aktuelle Thema nicht verfügbar.");
            contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">Es konnten keine Beiträge geladen werden.</p>`;
            hideOverlayLoadingSpinner();
            return;
        }

        const itemsToDisplay = shuffleArray([...allThemesContentData[currentThemeKey].postings]);

        itemsToDisplay.forEach(item => { 
            const postItemDiv = document.createElement('div');
            postItemDiv.classList.add('content-item');
            postItemDiv.style.marginBottom = '30px';

            if (useTranslated && item.translatedHtml) { 
                const translatedText = extractTweetText(item.translatedHtml);
                if (translatedText) {
                    const translatedTextElem = document.createElement('p');
                    translatedTextElem.classList.add('translated-tweet-text');
                    translatedTextElem.innerHTML = `<strong>Übersetzung:</strong><br>${translatedText.replace(/\n/g, '<br>')}`;
                    postItemDiv.appendChild(translatedTextElem);
                }
            }
            const tweetWrapper = document.createElement('div');
            tweetWrapper.innerHTML = item.html;
            postItemDiv.appendChild(tweetWrapper);
            contentArea.appendChild(postItemDiv);
        });

        // The showOverlayLoadingSpinner is now called at the beginning of loadTwitterWidgets
        // This ensures it is active when the Twitter script starts fetching embeds.
        loadTwitterWidgets(contentArea); 
    }


    function checkAndDisplayVideoContent() {
        const fiveSecondsPassed = (Date.now() - videoCategoryClickTime) >= 5000;
        
        if (allVideosReadyConsoleLogged && fiveSecondsPassed) {
            console.log(`%c[VIDEO STATUS] Both conditions met: Videos are ready AND 5 seconds have passed. Displaying video content.`, 'color: #007bff; font-weight: bold;');
            
            const loadingOverlay = contentArea.querySelector('.loading-overlay');
            if (loadingOverlay) loadingOverlay.remove();
            
            if (videoContentWrapperElement) {
                videoContentWrapperElement.style.display = 'block';

                if (mainContainer && videoContentWrapperElement) {
                   const wrapperRect = videoContentWrapperElement.getBoundingClientRect();
                   const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
                   
                   const targetScrollPosition = wrapperRect.top + currentScrollY;
                   
                   window.scrollTo({
                       top: targetScrollPosition,
                       behavior: 'smooth'
                   });
                   console.log(`[SCROLL] Scrolled to video content at Y-position: ${targetScrollPosition}`);
                }
            }
            videoCategoryClickTime = 0;
        } else {
            console.log(`%c[VIDEO STATUS] Waiting for conditions: Ready: ${allVideosReadyConsoleLogged}, 5s Passed: ${fiveSecondsPassed}.`, 'color: orange;');
            if (fiveSecondsPassed && !allVideosReadyConsoleLogged) {
                 setTimeout(checkAndDisplayVideoContent, 500);
            }
        }
    }


    function displayContent(category) {
        if (videoIntersectionObserver) {
            videoIntersectionObserver.disconnect();
            videoIntersectionObserver = null;
        }

        if (category === 'chatbot') {
            contentArea.classList.add('chatbot-mode');
            contentArea.classList.remove('video-mode');
        } else if (category === 'videos') {
            contentArea.classList.add('video-mode');
            contentArea.classList.remove('chatbot-mode');
        }
        else {
            resetContentAreaStyles();
        }

        if (category === 'chatbot') {
            contentArea.innerHTML = `
                <iframe
                    src="chat-app.html"
                    title="Experten-Chat zum Weltraumtourismus"
                    style="width: 100%; height: 100%; border: none; border-radius: 0; overflow: hidden;"
                ></iframe>
            `;
            const iframe = contentArea.querySelector('iframe');
            if (iframe) {
                iframe.focus({ preventScroll: true });
            }
            setTimeout(() => {
                if (contentArea) {
                    contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 50);

            return;
        }

        if (!allThemesContentData[currentThemeKey]) {
            contentArea.innerHTML = `<p class="error-message">Fehler: Inhaltsdaten für das Thema "${currentThemeKey}" konnten nicht geladen werden oder existieren nicht anhand des aktuellen Themes: "${currentThemeKey}".</p>`;
            console.error(`Inhaltsdaten für das Thema "${currentThemeKey}" nicht verfügbar.`);
            return;
        }

        if (category === 'videos') {
            showLoadingScreen(category);

            videoContentWrapperElement = document.createElement('div');
            videoContentWrapperElement.style.display = 'none';
            videoContentWrapperElement.classList.add('video-content-wrapper');

            const videoMessageDiv = document.createElement('div');
            videoMessageDiv.classList.add('video-top-message');
            videoMessageDiv.innerHTML = `
                <p>Swipe im Videoplayer nach unten, um weitere Kurzvideos zu entdecken.</p>
            `;
            videoContentWrapperElement.appendChild(videoMessageDiv);

            const videoPlayerContainer = document.createElement('div');
            videoPlayerContainer.classList.add('video-player-container');
            videoContentWrapperElement.appendChild(videoPlayerContainer);

            contentArea.appendChild(videoContentWrapperElement);

            const videosToInit = [];
            const videos = shuffleArray([...allThemesContentData[currentThemeKey].videos]);

            totalVideosExpected = videos.length;
            videosReadyCount = 0;
            allVideosReadyConsoleLogged = false;

            if (totalVideosExpected === 0) {
                console.log(`%c[VIDEO STATUS] No videos to initialize for this theme. All (0) videos are considered ready.`, 'color: green; font-weight: bold;');
                allVideosReadyConsoleLogged = true;
                videoContentWrapperElement.style.display = 'block';
                const loadingOverlay = contentArea.querySelector('.loading-overlay');
                if (loadingOverlay) loadingOverlay.remove();
                return;
            }


            videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const playerPlaceholder = entry.target.querySelector('.youtube-player-placeholder');
                    if (!playerPlaceholder) return; 

                    const playerId = playerPlaceholder.id;
                    const player = youtubePlayers[playerId];

                    if (!player || !player.isApiReady || !player.muteButtonElement || !player.originalVideoId) {
                        return;
                    }

                    if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                        if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                            console.log(`[IO] Playing video: ${playerId}`);

                            Object.values(youtubePlayers).forEach(p => {
                                if (p !== player && p.isApiReady && typeof p.getPlayerState === 'function' && 
                                    (p.getPlayerState() === YT.PlayerState.PLAYING || p.getPlayerState() === YT.PlayerState.BUFFERING)) {
                                    console.log(`[IO] Force pausing video: ${p.getIframe().id} (another video is now active).`);
                                    p.pauseVideo();
                                }
                            });
                            
                            player.playVideo();
                            currentPlayingVideoPlayer = player;

                            const muteBtn = player.muteButtonElement;
                            if (isGloballyMuted) {
                                player.mute();
                                if (muteBtn) muteBtn.innerHTML = volumeOffSvg;
                            } else {
                                player.unMute();
                                player.setVolume(10);
                                if (muteBtn) muteBtn.innerHTML = volumeUpSvg; 
                            }
                        }
                        player.isCued = true;
                    }
                    else if (entry.isIntersecting && entry.intersectionRatio > 0 && entry.intersectionRatio < 0.8) {
                        if (player.getPlayerState() === YT.PlayerState.UNSTARTED && !player.isCued) {
                            console.log(`[IO] Cueing video for pre-buffering: ${playerId}`);
                            player.cueVideoById(player.originalVideoId);
                            player.isCued = true;
                        }
                    }
                    else if (!entry.isIntersecting) {
                        if (player.getPlayerState() === YT.PlayerState.PLAYING || player.getPlayerState() === YT.PlayerState.BUFFERING) {
                            console.log(`[IO] Pausing video out of view: ${playerId}`);
                            player.pauseVideo();
                        }
                        if (currentPlayingVideoPlayer === player) {
                            console.log(`[IO] Clearing currentPlayingVideoPlayer: ${playerId}`);
                            currentPlayingVideoPlayer = null;
                        }
                        player.isCued = false;
                    }
                });
            }, {
                root: videoPlayerContainer,
                rootMargin: '0px 0px 300px 0px',
                threshold: [0, 0.8]
            });


            videos.forEach((item, index) => {
                const videoSlide = document.createElement('div');
                videoSlide.classList.add('video-slide');
                const uniquePlayerId = `youtube-player-${category}-${index}`;

                const videoControlsDiv = document.createElement('div');
                videoControlsDiv.classList.add('video-controls');

                const muteButton = document.createElement('button');
                muteButton.classList.add('mute-button');
                muteButton.dataset.playerId = uniquePlayerId;
                muteButton.innerHTML = (isGloballyMuted ? volumeOffSvg : volumeUpSvg);
                videoControlsDiv.appendChild(muteButton);

                videoSlide.innerHTML = `
                    <div id="${uniquePlayerId}" class="youtube-player-placeholder"></div>
                `;
                videoSlide.appendChild(videoControlsDiv);
                videoPlayerContainer.appendChild(videoSlide);

                videosToInit.push({
                    id: uniquePlayerId,
                    videoId: item.embedUrl.split('/').pop().split('?')[0],
                    autoplay: false,
                    muteButton: muteButton,
                });

                videoIntersectionObserver.observe(videoSlide);
            });

            const endSlide = document.createElement('div');
            endSlide.classList.add('video-end-slide');
            endSlide.innerHTML = `
                <p>Keine weiteren Videos zu diesem Thema gefunden.</p>
            `;
            videoPlayerContainer.appendChild(endSlide);
            videoIntersectionObserver.observe(endSlide);


            videosToInit.forEach(videoData => {
                if (youtubeAPIReady) {
                    initializeYouTubePlayer(videoData);
                } else {
                    videoInitializationQueue.push(videoData);
                }
            });

            return;
        }


        contentArea.innerHTML = '';
        let itemsToDisplay = allThemesContentData[currentThemeKey] ? allThemesContentData[currentThemeKey][category] : null;

        if (!itemsToDisplay || itemsToDisplay.length === 0) {
            contentArea.innerHTML = `<p>Leider keine ${category}-Beiträge zum Thema "${themeInput.value}" gefunden.</p>`;
            return;
        }

        if (category === 'zeitungsartikel') {
            itemsToDisplay = shuffleArray(itemsToDisplay);
        }

        switch (category) {
            case 'memes':
                if (lastDisplayedMemeBatch.length > 0) {
                    contentArea.innerHTML = ''; 
                    lastDisplayedMemeBatch.forEach(meme => {
                        const memeDiv = document.createElement('div');
                        memeDiv.classList.add('content-item', 'generated-meme');
                        memeDiv.innerHTML = `
                            <h3>${meme.title}</h3>
                            <img src="${meme.image}" alt="${meme.title}" style="max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 4px;">
                        `;
                        contentArea.appendChild(memeDiv);
                    });
                    
                    const allShownMessageDiv = document.createElement('div');
                    allShownMessageDiv.style.textAlign = 'center';
                    allShownMessageDiv.style.marginTop = '20px';
                    allShownMessageDiv.innerHTML = `<p>${loadingMessages.memes.allShown}</p>`;
                    contentArea.appendChild(allShownMessageDiv);
                    hideMemeNotification();
                    return;
                }

                if (memesArrayForGeneration.length === 0 && allThemesContentData[currentThemeKey] && allThemesContentData[currentThemeKey].memes && allThemesContentData[currentThemeKey].memes.length > 0) {
                    memesArrayForGeneration = shuffleArray([...allThemesContentData[currentThemeKey].memes]);
                }

                if (isMemeGenerationActive) {
                    showLoadingScreen(category, 'creating');
                    showMemeNotification(loadingMessages.memes.creating, 'loading');
                    return;
                }

                if (memesArrayForGeneration.length === 0) {
                    contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                    showMemeNotification(loadingMessages.memes.allShown, 'info', false);
                    return;
                }

                showMemeGenerationPrompt();
                hideMemeNotification(); 
                break;
            case 'postings':
                renderPostings(true); 
                break;
            case 'zeitungsartikel':
                itemsToDisplay.forEach(item => {
                    const articleDiv = document.createElement('div');
                    articleDiv.classList.add('content-item');
                    articleDiv.innerHTML = `
                        <h3>${item.title}</h3>
                        <p>${item.snippet}</p>
                        <p class="article-meta">
                            Veröffentlicht: <strong>${item.date}</strong> |
                            Lesezeit: <strong>${item.readTime}</strong> |
                            Quelle: <strong>${item.journal}</strong>
                        </p>
                        <a href="${item.link}" target="_blank" class="zeitungsartikel-link">Artikel lesen</a>
                    `;
                    contentArea.appendChild(articleDiv);
                });
                break;
            default:
                contentArea.innerHTML = '<p>Diese Kategorie existiert nicht.</p>';
        }
    }

    function initializeYouTubePlayer(videoData) {
        const playerElement = document.getElementById(videoData.id);
        if (!playerElement) {
            console.warn(`Platzhalter für Player-ID ${videoData.id} nicht gefunden. Video wird nicht initialisiert. Dies kann vorkommen, wenn die Kategorie schnell gewechselt wird.`);
            return;
        }

        const player = new YT.Player(videoData.id, {
            videoId: videoData.videoId,
            playerVars: {
                autoplay: 0,
                controls: 0,
                mute: 1,
                loop: 1,
                playlist: videoData.videoId,
                playsinline: 1,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3
            },
            events: {
                'onReady': (event) => onPlayerReady(event, videoData.muteButton),
                'onStateChange': (event) => onPlayerStateChange(event, videoData.muteButton),
                'onError': onPlayerError
            }
        });
        youtubePlayers[videoData.id] = player;
        player.muteButtonElement = videoData.muteButton;
        player.isApiReady = false;
        player.isCued = false;
        player.originalVideoId = videoData.videoId;

        console.log(`Player ${videoData.id} initialization attempted for video ID ${videoData.videoId}.`);
    }

    function onPlayerReady(event, muteButtonElement) {
        const player = event.target;
        player.isApiReady = true;
        const playerId = player.getIframe().id;
        console.log(`Player ${playerId} is ready.`);

        if (muteButtonElement) {
            muteButtonElement.addEventListener('click', () => toggleMute(player, muteButtonElement));
            if (isGloballyMuted) {
                player.mute();
                muteButtonElement.innerHTML = volumeOffSvg;
            } else {
                player.unMute();
                player.setVolume(3);
                muteButtonElement.innerHTML = volumeUpSvg;
            }
        }

        videosReadyCount++;
        if (videosReadyCount === totalVideosExpected && !allVideosReadyConsoleLogged) {
            console.log(`%c[VIDEO STATUS] All ${totalVideosExpected} YouTube players are ready for the current theme!`, 'color: green; font-weight: bold;');
            allVideosReadyConsoleLogged = true;
            checkAndDisplayVideoContent();
        }
    }

    function onPlayerStateChange(event, muteButtonElement) {
        if (!event.target.isApiReady) {
            console.warn("onPlayerStateChange fired for a non-API-ready player. Ignoring.");
            return;
        }

        const playerId = event.target.getIframe().id;
        const player = youtubePlayers[playerId];

        if (muteButtonElement) {
            if (player.isMuted()) {
                muteButtonElement.innerHTML = volumeOffSvg;
            } else {
                muteButtonElement.innerHTML = volumeUpSvg;
            }
        }

        if (event.data === YT.PlayerState.ENDED) {
            event.target.playVideo();
        }
    }

    function onPlayerError(event) {
        const playerId = event.target && typeof event.target.getIframe === 'function' ? event.target.getIframe().id : 'Unknown Player (pre-API-ready error?)';
        console.error(`YouTube Player Error for ${playerId}:`, event.data);

        const errorElement = document.getElementById(playerId);
        if (errorElement && errorElement.parentNode) {
            const videoData = allThemesContentData[currentThemeKey]?.videos.find(v => v.embedUrl.includes(event.target.getVideoData ? event.target.getVideoData().video_id : ''));
            errorElement.parentNode.innerHTML = `
                <div style="color: white; padding: 20px; text-align: center; background-color: #333; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <h3>Video nicht verfügbar</h3>
                    <p>Das Video '${videoData ? videoData.title : 'Unbekannt'}' konnte nicht geladen werden.</p>
                    <p style="font-size: 0.8em;">(Fehlercode: ${event.data}).</p>
                    <p style="font-size: 0.8em;">Dies kann an Einbettungsbeschränkungen liegen.</p>
                </div>
            `;
        }
    }

    function initializeApplicationLogic() {
        currentThemeKey = themeInput.value.toLowerCase();

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const category = button.id.replace('btn', '').toLowerCase();

                isPostingsInitialRender = false;
                if (postingsReclickTimeoutId) {
                    clearTimeout(postingsReclickTimeoutId);
                    postingsReclickTimeoutId = null;
                    console.log(`%c[Postings] Cleared pending re-click timeout for new category selection.`, 'color: grey;');
                }
                // Moved hideOverlayLoadingSpinner from here to ensure it's handled by loadTwitterWidgets logic or on resetContentAreaStyles
                // hideOverlayLoadingSpinner(); 

                if (currentMainLoadingTimeoutId) {
                    clearTimeout(currentMainLoadingTimeoutId);
                    currentMainLoadingTimeoutId = null;
                    console.log(`%c[Global Loader] Cleared current main loading timeout.`, 'color: grey;');
                }

                window.scrollTo({ top: 0, behavior: 'instant' });

                if (!loadedCategoriesPerTheme[currentThemeKey]) {
                    loadedCategoriesPerTheme[currentThemeKey] = new Set();
                }
                const currentThemeLoadedCategories = loadedCategoriesPerTheme[currentThemeKey];

                if (category === 'chatbot') {
                    displayContent(category);
                    currentThemeLoadedCategories.add(category);
                } else if (category === 'postings') {
                    console.log(`%c[Postings] Postings category clicked.`, 'color: #007bff;');
                    
                    if (!currentThemeLoadedCategories.has(category)) {
                        isPostingsInitialRender = true;
                        console.log(`%c[Postings] Setting isPostingsInitialRender to true for initial load.`, 'color: green;');
                    } else {
                        console.log(`%c[Postings] isPostingsInitialRender remains false (already loaded).`, 'color: grey;');
                    }

                    // showOverlayLoadingSpinner is now called within loadTwitterWidgets
                    displayContent(category);
                    currentThemeLoadedCategories.add(category);
                    
                } else if (category === 'videos') {
                    videoCategoryClickTime = Date.now();
                    
                    currentMainLoadingTimeoutId = setTimeout(() => {
                        checkAndDisplayVideoContent(); 
                        currentMainLoadingTimeoutId = null;
                    }, 5000);

                    if (allThemesContentData[currentThemeKey] && allThemesContentData[currentThemeKey].videos) {
                        allThemesContentData[currentThemeKey].videos = shuffleArray(allThemesContentData[currentThemeKey].videos);
                    }
                    displayContent(category);
                    currentThemeLoadedCategories.add(category);

                } else {
                    if (!currentThemeLoadedCategories.has(category)) {
                        showLoadingScreen(category);
                        currentMainLoadingTimeoutId = setTimeout(() => {
                            displayContent(category);
                            currentThemeLoadedCategories.add(category);
                            currentMainLoadingTimeoutId = null;
                        }, 5000);
                    } else {
                        displayContent(category);
                    }
                }
            });
        });

        contentArea.innerHTML = '<p>Wähle eine Option, um Beiträge zum Thema Weltraumtourismus zu sehen.</p>';
        resetContentAreaStyles();
        hideMemeNotification();
    }

    if (typeof YT === 'undefined' || !YT.Player) {
        console.log("Dynamisch lade YouTube Iframe API Script...");
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
        console.log("YouTube API Objekt existiert bereits. Synchronisiere internen Bereitschaftsstatus.");
        if (!youtubeAPIReady) {
            window.onYouTubeIframeAPIReady();
        }
    }


    fetch('contentData.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} - Konnte contentData.json nicht laden.`);
            }
            return response.json();
        })
        .then(data => {
            allThemesContentData = data;
            console.log("Inhaltsdaten erfolgreich geladen:", allThemesContentData);
            initializeApplicationLogic();
        })
        .catch(error => {
            console.error("Fehler beim Laden der Inhaltsdaten:", error);
            contentArea.innerHTML = `<p class="error-message">Ein Fehler ist aufgetreten: ${error.message}. Die Inhalte konnten nicht geladen werden.</p>`;
            resetContentAreaStyles();
            hideMemeNotification();
        });
});