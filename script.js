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

    let youtubeAPIReady = false;
    const videoInitializationQueue = [];
    const youtubePlayers = {};

    let currentPlayingVideoPlayer = null;
    let videoIntersectionObserver = null;

    let isGloballyMuted = true;

    const loadedCategoriesPerTheme = {};

    // allThemesContentData wird jetzt aus einer externen Datei geladen
    let allThemesContentData = {}; // Geändert von const zu let

    // currentThemeKey wird erst nach dem Laden der Daten initialisiert
    let currentThemeKey; // Geändert von const zu let und Initialisierung entfernt

    let arePostsTranslated = false;
    let hasAskedForTranslation = false;

    const loadingMessages = {
        memes: {
            searching: "Durchsuche die Datenbank nach vorhandenen Memes...",
            notFoundPrompt: "Zu diesem Thema wurden leider keine Memes gefunden. Möchtest du, dass ich ein Meme dazu erstelle?",
            creating: "Erstelle Meme zum Thema Weltraumtourismus mit Hilfe von ChatGPT. Dies kann einige Minuten dauern, sieh dir daher inzwischen die anderen Kategorien dieser Website durch. Du bekommst eine Nachricht, sobald sie fertig ist.",
            creating2: "Erstelle Meme",
            askAgain: "Soll ich noch ein Meme erstellen?",
            allShown: "Es können keine neuen Memes mehr erstellt werden..."
        },
        videos: [
            "Suche nach Kurzvideos.",
            "Füge auch englische Videos hinzu."
        ],
        postings: {
            searching: "Durchstöbere X (Twitter) nach aktuellen Beiträgen...",
            translating: "Übersetze Beiträge..."
        },
        zeitungsartikel: "Scanne Online-Archive nach relevanten Zeitungsartikeln...",
        chatbot: "Verbinde mit dem Experten für Weltraumtourismus..."
    };

    let currentMainLoadingTimeoutId = null;
    let memeGenerationTimeoutId = null;
    let generatedMemeBuffer = null;
    let isMemeGenerationActive = false;
	
    let currentDisplayedMeme = null;

    let memesArrayForGeneration = [];


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
            memeNotification.onclick = () => {
                if (btnMemes) {
                    btnMemes.click();
                }
                hideMemeNotification();
            };
        } else {
            memeNotification.style.cursor = 'default';
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
        if (window.twttr && window.twttr.widgets) {
            window.twttr.widgets.load(targetElement);
        } else if (!twitterWidgetsLoaded) {
            const script = document.createElement('script');
            script.src = "https://platform.twitter.com/widgets.js";
            script.async = true;
            script.charset = "utf-8";
            script.onload = () => {
                if (window.twttr && window.twttr.widgets) {
                    window.twttr.widgets.load(targetElement);
                }
            };
            document.body.appendChild(script);
            twitterWidgetsLoaded = true;
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


        if (videoIntersectionObserver) {
            videoIntersectionObserver.disconnect();
            videoIntersectionObserver = null;
        }
        for (const playerId in youtubePlayers) {
            if (youtubePlayers[playerId] && typeof youtubePlayers[playerId].destroy === 'function') {
                youtubePlayers[playerId].destroy();
            }
            delete youtubePlayers[playerId];
        }
        currentPlayingVideoPlayer = null;

    }

    const volumeUpSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.98 7-4.66 7-8.77s-2.99-7.79-7-8.77z"/></svg>`;
    const volumeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .96-.24 1.86-.65 2.68l1.66 1.66C21.23 14.6 22 13.31 22 12c0-4.07-3.05-7.44-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.98 4.98L3 12v6h4l5 5V12.72L19.73 21 21 19.73 12.27 11 4.27 3zM10 15.27V12.73L12.42 15.15l-2.42.12z"/></svg>`;


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

    // Entfernt, da es nun extern geladen wird
    // const allThemesContentData = { ... };


    function displayMeme(memeData) {
        contentArea.innerHTML = '';

        const memeDiv = document.createElement('div');
        memeDiv.classList.add('content-item');
        memeDiv.innerHTML = `
            <h3>${memeData.title}</h3>
            <img src="${memeData.image}" alt="${memeData.title}" style="max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 4px;">
        `;
        contentArea.appendChild(memeDiv);
        currentDisplayedMeme = memeData;
    }

    function showMemeGenerationPrompt() {
        contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.notFoundPrompt}</p>`;
        const generateButton = document.createElement('button');
        generateButton.textContent = "Ja, bitte";
        generateButton.classList.add('option-btn');
        generateButton.style.marginTop = '20px';
        generateButton.addEventListener('click', () => {
            if (!isMemeGenerationActive) {
                startMemeGenerationProcess();
            }
        });
        contentArea.appendChild(generateButton);
    }

    function startMemeGenerationProcess() {
        if (isMemeGenerationActive) {
            console.log("Meme generation already active. Ignoring request.");
            return;
        }

        isMemeGenerationActive = true;
        showLoadingScreen('memes', 'creating');

        showMemeNotification(loadingMessages.memes.creating2, 'loading');

        // Sicherstellen, dass die Daten geladen sind
        if (!allThemesContentData[currentThemeKey] || !allThemesContentData[currentThemeKey].memes) {
            console.error("Meme-Daten sind für das aktuelle Thema nicht verfügbar.");
            isMemeGenerationActive = false;
            hideMemeNotification();
            contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">Es konnten keine Memes geladen werden.</p>`;
            return;
        }


        if (memesArrayForGeneration.length === 0) {
            memesArrayForGeneration = shuffleArray(allThemesContentData[currentThemeKey].memes);
        }

        if (memeGenerationTimeoutId) {
            clearTimeout(memeGenerationTimeoutId);
            memeGenerationTimeoutId = null;
        }

        memeGenerationTimeoutId = setTimeout(() => {
            isMemeGenerationActive = false;
            memeGenerationTimeoutId = null;

            if (memesArrayForGeneration.length > 0) {
                generatedMemeBuffer = memesArrayForGeneration.shift();
                showMemeNotification("Dein Meme ist fertig!", 'success', true);
            } else {
                generatedMemeBuffer = null;
                showMemeNotification(loadingMessages.memes.allShown, 'info', false);
            }

            const currentContent = contentArea.querySelector('#loadingMessageText');
            if (currentContent && currentContent.textContent.includes(loadingMessages.memes.creating)) {
                if (generatedMemeBuffer) {
                    displayMeme(generatedMemeBuffer);
                    askForAnotherMemePrompt();
                    generatedMemeBuffer = null;
                } else {
                    contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                }
            } else {
                console.log("Meme generated in background, waiting for user to return to Memes category.");
            }
        }, 1000);//Hier Zeit der Memegenerierung ändern
    }

    function askForAnotherMemePrompt() {
        if (memesArrayForGeneration.length > 0) {
            const askAgainDiv = document.createElement('div');
            askAgainDiv.style.textAlign = 'center';
            askAgainDiv.style.marginTop = '20px';
            askAgainDiv.innerHTML = `<p>${loadingMessages.memes.askAgain}</p>`;

            const yesButton = document.createElement('button');
            yesButton.textContent = "Ja, bitte";
            yesButton.classList.add('option-btn');
            yesButton.addEventListener('click', () => {
                if (!isMemeGenerationActive) {
                    startMemeGenerationProcess();
                }
            });

            askAgainDiv.appendChild(yesButton);
            contentArea.appendChild(askAgainDiv);
        } else {
            contentArea.innerHTML += `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
        }
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
        contentArea.innerHTML = '';
        arePostsTranslated = useTranslated;
        hasAskedForTranslation = true;

        // Sicherstellen, dass die Daten geladen sind
        if (!allThemesContentData[currentThemeKey] || !allThemesContentData[currentThemeKey].postings) {
            console.error("Postings-Daten sind für das aktuelle Thema nicht verfügbar.");
            contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">Es konnten keine Beiträge geladen werden.</p>`;
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
        loadTwitterWidgets(contentArea);
    }

    function showTranslationPrompt() {
        contentArea.innerHTML = `
            <div id="translationPrompt" style="text-align: center; margin-top: 20px; padding: 20px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                <p style="font-size: 1.1em; margin-bottom: 20px;">Viele der gefundenen Posts sind auf Englisch. Sollen diese übersetzt werden?</p>
                <button id="translateYes" class="option-btn" style="margin-right: 15px; padding: 10px 20px;">Ja</button>
                <button id="translateNo" class="option-btn" style="padding: 10px 20px;">Nein</button>
            </div>
        `;
        const yesButton = document.getElementById('translateYes');
        const noButton = document.getElementById('translateNo');

        yesButton.addEventListener('click', () => {
            showLoadingScreen('postings', 'translating');
            setTimeout(() => {
                renderPostings(true);
            }, 3000);
        });

        noButton.addEventListener('click', () => {
            renderPostings(false);
        });
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

        contentArea.innerHTML = '';


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

        // Sicherstellen, dass die Daten geladen sind und das Thema existiert
        if (!allThemesContentData[currentThemeKey]) {
            contentArea.innerHTML = `<p class="error-message">Fehler: Inhaltsdaten für das Thema "${currentThemeKey}" konnten nicht geladen werden oder existieren nicht.</p>`;
            console.error(`Inhaltsdaten für das Thema "${currentThemeKey}" nicht verfügbar.`);
            return;
        }

        if (category === 'videos') {
            const videoMessageDiv = document.createElement('div');
            videoMessageDiv.classList.add('video-top-message');
            videoMessageDiv.innerHTML = `
                <p>Swipe im Videoplayer nach unten, um weitere Kurzvideos zu entdecken.</p>
            `;
            contentArea.appendChild(videoMessageDiv);

            const videoPlayerContainer = document.createElement('div');
            videoPlayerContainer.classList.add('video-player-container');

            const videosToInit = [];

            const videos = shuffleArray([...allThemesContentData[currentThemeKey].videos]);


            videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const playerPlaceholder = entry.target.querySelector('.youtube-player-placeholder');
                    if (!playerPlaceholder) return; // Überspringen, falls der Platzhalter nicht mehr existiert

                    const playerId = playerPlaceholder.id;
                    const player = youtubePlayers[playerId];

                    if (!player || !player.muteButtonElement) {
                        console.warn(`Player ${playerId} oder zugehörige Buttons nicht gefunden oder nicht bereit für IntersectionObserver.`);
                        return;
                    }

                    if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                        if (currentPlayingVideoPlayer && currentPlayingVideoPlayer !== player) {
                            console.log(`Stopping player ${currentPlayingVideoPlayer.h.id}`);
                            currentPlayingVideoPlayer.pauseVideo();
                            currentPlayingVideoPlayer.seekTo(0);
                        }

                        if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                            console.log(`Playing player ${playerId}`);
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
                    } else if (!entry.isIntersecting && player.getPlayerState() === YT.PlayerState.PLAYING) {
                        console.log(`Pausing player ${playerId} because it's out of view.`);
                        player.pauseVideo();
                        if (currentPlayingVideoPlayer === player) {
                            currentPlayingVideoPlayer = null;
                        }
                    }
                });
            }, {
                root: videoPlayerContainer,
                rootMargin: '0px',
                threshold: 0.8
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


            contentArea.appendChild(videoPlayerContainer);

            videosToInit.forEach(videoData => {
                if (youtubeAPIReady) {
                    initializeYouTubePlayer(videoData);
                } else {
                    videoInitializationQueue.push(videoData);
                }
            });

            if (videosToInit.length > 0) {
                setTimeout(() => {
                    const firstVideoPlayer = youtubePlayers[videosToInit[0].id];
                    if (firstVideoPlayer && typeof firstVideoPlayer.playVideo === 'function') {
                        console.log('Manually playing first video');
                        firstVideoPlayer.playVideo();
                        currentPlayingVideoPlayer = firstVideoPlayer;

                        if (isGloballyMuted) {
                            firstVideoPlayer.mute();
                            if (firstVideoPlayer.muteButtonElement) firstVideoPlayer.muteButtonElement.innerHTML = volumeOffSvg;
                        } else {
                            firstVideoPlayer.unMute();
                            firstVideoPlayer.setVolume(10);
                            if (firstVideoPlayer.muteButtonElement) firstVideoPlayer.muteButtonElement.innerHTML = volumeUpSvg;
                        }
                    }
                }, 100);
            }

            return;
        }

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
            if (isMemeGenerationActive) {
                showLoadingScreen(category, 'creating');
                showMemeNotification(loadingMessages.memes.creating, 'loading');
                return;
            }

            if (generatedMemeBuffer) {
                contentArea.innerHTML = '';
                displayMeme(generatedMemeBuffer);
                askForAnotherMemePrompt();
                generatedMemeBuffer = null;
                isMemeGenerationActive = false;
                hideMemeNotification();
                return;
            }

            if (currentDisplayedMeme) {
                const memeImageInDOM = contentArea.querySelector(`img[src="${currentDisplayedMeme.image}"]`);

                if (!memeImageInDOM) {
                    contentArea.innerHTML = '';
                    displayMeme(currentDisplayedMeme);
                }
                askForAnotherMemePrompt();
                hideMemeNotification();
                return;
            }

            if (memesArrayForGeneration.length === 0) {
                memesArrayForGeneration = shuffleArray(allThemesContentData[currentThemeKey].memes);
            }

            if (memesArrayForGeneration.length > 0) {
                showMemeGenerationPrompt();
                hideMemeNotification();
            } else {
                contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                showMemeNotification(loadingMessages.memes.allShown, 'info', false);
            }
            break;
            case 'postings':
                if (!hasAskedForTranslation) {
                    showTranslationPrompt();
                } else {
                    renderPostings(arePostsTranslated);
                }
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

    window.onYouTubeIframeAPIReady = function() {
        console.log('YouTube API is ready!');
        youtubeAPIReady = true;
        while (videoInitializationQueue.length > 0) {
            const videoData = videoInitializationQueue.shift();
            initializeYouTubePlayer(videoData);
        }
    };

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

        console.log(`Player ${videoData.id} initialization attempted for video ID ${videoData.videoId}.`);
    }

    function onPlayerReady(event, muteButtonElement) {
        console.log(`Player ${event.target.h.id} is ready.`);
        if (muteButtonElement) {
            muteButtonElement.addEventListener('click', () => toggleMute(event.target, muteButtonElement));
            if (isGloballyMuted) {
                event.target.mute();
                muteButtonElement.innerHTML = volumeOffSvg;
            } else {
                event.target.unMute();
                event.target.setVolume(3);
                muteButtonElement.innerHTML = volumeUpSvg;
            }
        }
    }

    function onPlayerStateChange(event, muteButtonElement) {
        const playerId = event.target.h.id;
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
        console.error(`YouTube Player Error for ${event.target.h.id}:`, event.data);
        const errorElement = document.getElementById(event.target.h.id);
        if (errorElement && errorElement.parentNode) {
            // Sicherstellen, dass allThemesContentData existiert
            // und currentThemeKey gesetzt ist, bevor darauf zugegriffen wird
            const videoData = allThemesContentData?.[currentThemeKey]?.videos.find(v => v.embedUrl.includes(event.target.getVideoData().video_id));
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

    // Die gesamte bestehende Logik innerhalb des DOMContentLoaded-Listeners
    // wird in eine Funktion verschoben.
    function initializeApplicationLogic() {
        // currentThemeKey kann jetzt sicher gesetzt werden, da allThemesContentData existiert
        currentThemeKey = themeInput.value.toLowerCase(); // Jetzt hier initialisiert

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const category = button.id.replace('btn', '').toLowerCase();

                if (currentMainLoadingTimeoutId) {
                    clearTimeout(currentMainLoadingTimeoutId);
                    currentMainLoadingTimeoutId = null;
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
                    if (!currentThemeLoadedCategories.has(category) || !hasAskedForTranslation) {
                        showLoadingScreen(category, 'searching');
                        currentMainLoadingTimeoutId = setTimeout(() => {
                            displayContent(category);
                            currentThemeLoadedCategories.add(category);
                            currentMainLoadingTimeoutId = null;
                        }, 5000);
                    } else {
                        displayContent(category);
                    }
                } else if (!currentThemeLoadedCategories.has(category)) {
                    showLoadingScreen(category);

                    if (category === 'videos' && Array.isArray(loadingMessages.videos)) {
                        const loadingMessageTextElement = document.getElementById('loadingMessageText');
                        setTimeout(() => {
                            if (loadingMessageTextElement && loadingMessages.videos.length > 1) {
                                loadingMessageTextElement.textContent = loadingMessages.videos[1];
                            }
                        }, 2500);
                    }

                    currentMainLoadingTimeoutId = setTimeout(() => {
                        // Sicherstellen, dass allThemesContentData[currentThemeKey].videos existiert, bevor geshuffled wird
                        if (allThemesContentData[currentThemeKey] && allThemesContentData[currentThemeKey].videos) {
                            allThemesContentData[currentThemeKey].videos = shuffleArray(allThemesContentData[currentThemeKey].videos);
                        }
                        displayContent(category);
                        currentThemeLoadedCategories.add(category);

                        if (category === 'videos' && mainContainer) {
                            setTimeout(() => {
                               const targetScrollPosition = mainContainer.offsetTop + mainContainer.offsetHeight - window.innerHeight + 20;

                               window.scrollTo({
                                   top: targetScrollPosition > 0 ? targetScrollPosition : 0,
                                   behavior: 'smooth'
                               });
                            }, 500);
                        }
                        currentMainLoadingTimeoutId = null;
                    }, 5000);
                } else {
                    if (category === 'memes') {
                        if (generatedMemeBuffer) {
                            displayMeme(generatedMemeBuffer);
                            askForAnotherMemePrompt();
                            generatedMemeBuffer = null;
                            isMemeGenerationActive = false;
                            hideMemeNotification();
                        }
                        else if (isMemeGenerationActive) {
                            showLoadingScreen(category, 'creating');
                            showMemeNotification(loadingMessages.memes.creating, 'loading');
                        }
                        else {
                            if (memesArrayForGeneration.length === 0) {
                                memesArrayForGeneration = shuffleArray(allThemesContentData[currentThemeKey].memes);
                            }
                            if (memesArrayForGeneration.length > 0) {
                                showMemeGenerationPrompt();
                                hideMemeNotification();
                            } else {
                                contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                                showMemeNotification(loadingMessages.memes.allShown, 'info', false);
                            }
                        }
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


    // Lade die Inhaltsdaten, bevor die Anwendung gestartet wird
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
            initializeApplicationLogic(); // Starte die Hauptanwendungslogik
        })
        .catch(error => {
            console.error("Fehler beim Laden der Inhaltsdaten:", error);
            contentArea.innerHTML = `<p class="error-message">Ein Fehler ist aufgetreten: ${error.message}. Die Inhalte konnten nicht geladen werden.</p>`;
            resetContentAreaStyles();
            hideMemeNotification();
        });
});