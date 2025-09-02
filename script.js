document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('contentArea');
    const buttons = document.querySelectorAll('.option-btn');
    const themeInput = document.getElementById('themeInput');

    const mainContainer = document.querySelector('.container');

    // Referenzen zu den Benachrichtigungselementen
    const memeNotification = document.getElementById('memeNotification');
    const notificationMessage = document.getElementById('notificationMessage');
    const notificationSpinner = document.getElementById('notificationSpinner');
    const notificationDismiss = document.getElementById('notificationDismiss');
    const btnMemes = document.getElementById('btnMemes'); // Referenz zum Memes-Button

    let twitterWidgetsLoaded = false;

    let youtubeAPIReady = false;
    const videoInitializationQueue = [];
    const youtubePlayers = {};

    let currentPlayingVideoPlayer = null;
    let videoIntersectionObserver = null;

    let isGloballyMuted = true;

    const loadedCategoriesPerTheme = {};

    const currentThemeKey = themeInput.value.toLowerCase();

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
        postings: "Durchstöbere X (Twitter) nach aktuellen Beiträgen...",
        zeitungsartikel: "Scanne Online-Archive nach relevanten Zeitungsartikeln...",
        chatbot: "Verbinde mit dem Experten für Weltraumtourismus..."
    };

    let currentMainLoadingTimeoutId = null;
    let memeGenerationTimeoutId = null;
    let generatedMemeBuffer = null;
    let isMemeGenerationActive = false;
	
    // Variable für das aktuell/zuletzt angezeigte Meme
    let currentDisplayedMeme = null;

    let memesArrayForGeneration = [];


    function showLoadingScreen(category, messageType = 'searching') {
        window.scrollTo({ top: 0, behavior: 'instant' });

        let message;
        if (category === 'memes' && typeof loadingMessages.memes === 'object') {
            message = loadingMessages.memes[messageType];
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

    // NEU: Funktionen zur Steuerung der Meme-Benachrichtigung
    function showMemeNotification(message, type = 'info', clickable = false) {
        notificationMessage.textContent = message;
        memeNotification.className = `meme-notification ${type}`; // Setzt die Klasse für Styling (loading, success, info)

        // Spinner nur bei 'loading' anzeigen
        if (type === 'loading') {
            notificationSpinner.style.display = 'block';
        } else {
            notificationSpinner.style.display = 'none';
        }

        // Klickbarkeit der gesamten Notification
        if (clickable) {
            memeNotification.style.cursor = 'pointer';
            memeNotification.onclick = () => {
                if (btnMemes) {
                    btnMemes.click(); // Klickt den Memes-Button, um zur Kategorie zu wechseln
                }
                hideMemeNotification(); // Notification ausblenden nach Klick
            };
        } else {
            memeNotification.style.cursor = 'default';
            memeNotification.onclick = null;
        }

        memeNotification.classList.remove('hidden');
    }

    function hideMemeNotification() {
        memeNotification.classList.add('hidden');
        memeNotification.onclick = null; // Klick-Handler entfernen
    }

    // Event Listener für den Schließen-Button der Notification
    notificationDismiss.addEventListener('click', (event) => {
        event.stopPropagation(); // Verhindert, dass der Klick das Notification-Element selbst auslöst
        hideMemeNotification();
    });
    // ENDE NEU: Funktionen zur Steuerung der Meme-Benachrichtigung


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

    const allThemesContentData = {
        "weltraumtourismus": { 
            memes: [
  	  {
                    title: "Google-Bewertungen in 2050",
                    image: "con-memes/Both-bewertunggoogle.png "
                },
  	  {
                    title: "Mein CO2-Fußabdruck auf dem Mars",
                    image: "con-memes/CO2-Meme.png"
                },
  	  {
                    title: "Escape Plan(et)",
                    image: "con-memes/EscapePlan-Meme.png"
                },
  	  {
                    title: "Instagram vs. Reality",
                    image: "con-memes/Insta-Reality.png"
                },
  	  {
                    title: "Influencer im All",
                    image: "con-memes/kosten.png"
                },
  	  {
                    title: "Weltraumtourismus 2050",
                    image: "con-memes/SpaceRyanair.png"
                },
  	  {
                    title: "SpaceX-pectations",
                    image: "con-memes/UrlaubFürAlle.png"
                }

            ],
            videos: [
                {
                    title: "Weltraumtourismus: Realität oder Science-Fiction",
                    embedUrl: "https://www.youtube.com/embed/6gFiOZyl8hE", 
                    description: "Flash Wissen"
                },
                {
                    title: "Promifrauen kritisieren Weltraum-Touristinnen.",
                    embedUrl: "https://www.youtube.com/embed/sCSr6XXXykU", 
                    description: "20 Minuten"
                },
                {
                    title: "The Challenge of Sustainable Space Tourism: Why It's Still Out of Reach",
                    embedUrl: "https://www.youtube.com/embed/PaQv1nHJV2E", 
                    description: "unfulfilledfutures"
                },
                {
                    title: "Für 450.000€ in den WELTRAUM?!",
                    embedUrl: "https://www.youtube.com/embed/Vs1Yfq_kEG4", 
                    description: "Weltraumranger"
                },
                {
                    title: "Inside Virgin Galactic’s first tourist spaceflight",
                    embedUrl: "https://www.youtube.com/embed/2V4VU8p6Au0", 
                    description: "SkyNews"
                }

            ],
            postings: [
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">&quot;katy perry going to space!!&quot; <br>The actual trip: <a href="https://t.co/JK4mOyuiKY">pic.twitter.com/JK4mOyuiKY</a></p>&mdash; solcito (@_valkyriecroft) <a href="https://twitter.com/_valkyriecroft/status/1911766192647287039?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism is not space exploration<br>its beginning of a new fossil fuel powered business for billionaires to get their kicks in space, watching the spectacle of a burnt out and flooded Earth, as they fuel even more emissions</p>&mdash; GO GREEN (@ECOWARRIORSS) <a href="https://twitter.com/ECOWARRIORSS/status/1419332100008955907?ref_src=twsrc%5Etfw">July 25, 2021</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Modern billionaires are the most selfish humans in history.<br><br>Past billionaires:<br><br>- Built libraries<br>- Cured diseases<br>- Advanced civilization.<br><br>Today&#39;s? Space tourism and yacht measuring contests.<br><br>Here&#39;s the ugly truth of modern billionaires: 🧵 <a href="https://t.co/eezWg9nF0i">pic.twitter.com/eezWg9nF0i</a></p>&mdash; Logan Weaver (@LogWeaver) <a href="https://twitter.com/LogWeaver/status/1949082214614118440?ref_src=twsrc%5Etfw">July 26, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },

    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism is reaching new heights! Private companies are launching civilians to the edge of space for unforgettable views and weightless experiences. Would you take a trip among the stars? <a href="https://twitter.com/hashtag/SpaceTourism?src=hash&amp;ref_src=twsrc%5Etfw">#SpaceTourism</a> <a href="https://twitter.com/hashtag/FutureTravel?src=hash&amp;ref_src=twsrc%5Etfw">#FutureTravel</a> <a href="https://t.co/xqXzwNebWw">pic.twitter.com/xqXzwNebWw</a></p>&mdash; Rafael (@RafaelMCam) <a href="https://twitter.com/RafaelMCam/status/1946606087475429414?ref_src=twsrc%5Etfw">July 19, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism: Rockets emit 100 times more CO2 per passenger than flights – imagine a whole industry <a href="https://t.co/ypqinXj77k">https://t.co/ypqinXj77k</a> <a href="https://t.co/xJtHTV6jWy">pic.twitter.com/xJtHTV6jWy</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/1419764070119579655?ref_src=twsrc%5Etfw">July 26, 2021</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Tourism for successful people: the world&#39;s first space hotel will open as early as 2027.<br><br>Built by Above: Space Development, it will host 400 guests and 112 crew members on a rotating structure designed to create gravity similar to the moon.<br><br>The hotel will offer a full-service… <a href="https://t.co/A6Nr5VNW0u">pic.twitter.com/A6Nr5VNW0u</a></p>&mdash; Black Hole (@konstructivizm) <a href="https://twitter.com/konstructivizm/status/1936988331499483200?ref_src=twsrc%5Etfw">June 23, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },


    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Private space tourism is growing, making trips to orbit affordable. <a href="https://twitter.com/hashtag/SpaceTourism?src=hash&amp;ref_src=twsrc%5Etfw">#SpaceTourism</a> <a href="https://twitter.com/hashtag/FutureOfTravel?src=hash&amp;ref_src=twsrc%5Etfw">#FutureOfTravel</a></p>&mdash; Karen Vazquez (@KarenVazqu84161) <a href="https://twitter.com/KarenVazqu84161/status/1951069445247606926?ref_src=twsrc%5Etfw">July 31, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Katy Perry says she now looks at Earth through a “whole new perspective” after traveling to space<br><br>She was in space for a total of 11 minutes <a href="https://t.co/3ErSeVJt3d">pic.twitter.com/3ErSeVJt3d</a></p>&mdash; Daily Noud (@DailyNoud) <a href="https://twitter.com/DailyNoud/status/1911819148755149176?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    }

            ],
            zeitungsartikel: [
                    {
        'title': " Auf dem Weg zu neuen Weltraumorten und der Nutzung dortiger kommerzieller Möglichkeiten – Eine realistische Zukunftsvision oder eine Vision, die kaum je Realität werden kann?",
        'snippet': "Der Preis für einen derartigen Trip wird voraussichtlich für viele Jahre und gar Jahrzehnte noch sehr hoch bleiben, da der Aufwand des Fluges, die Ernährung und die notwendigen Vorbereitungen der Touristen, sich im gravitationslosen Umfeld zu bewegen, auf absehbare Zeit extrem hoch bleiben werden. Noch immer kostet jedes Kilogramm, das die Erdanziehung überwinden muss, mehrere zehntausend Euro! Zudem sind Raketenstarts in den Weltraum bis heute keine Routineoperation, nicht zu vergleichen mit einem Flugzeugstart. Bei jedem Start bestehen immer noch signifikante Risiken.",
        'link': "https://scilogs.spektrum.de/beobachtungen-der-wissenschaft/auf-dem-weg-zu-neuen-weltraumorten-und-der-nutzung-dortiger-kommerzieller-moeglichkeiten-eine-realistische-zukunftsvision-oder-eine-vision-die-kaum-je-realitaet-werden-kann/",
        'date': "04.08.2022",
        'readTime': "7 Minuten",
        'journal': "Spektrum.de SciLogs."
    },
    {
        'title': "Der hohe Preis des Weltraumtourismus",
        'snippet': "Vor allem bei Raketen mit Kerosinantrieb, wie sie aktuell etwa SpaceX und Blue Origin verwenden, seien die Auswirkungen auf die Atmosphäre groß. Auch Thomas Reiter ist dieser Ansicht: &quot; Da wird enorm viel CO2 durch Verbrennung in die Atmosphäre eingebracht. &quot; … &quot;Es bedarf einer enormen Energie, um auch nur kleinste Massen in den Orbit zu bringen&quot;, so Reiter. Um ein Kilogramm Gewicht ins All zu transportieren, sind beispielsweise rund 40 Megajoule an Energie notwendig.",
        'link': "https://nationalgeographic.de/reise-und-abenteuer/2021/09/der-hohe-preis-des-weltraumtourismus/",
        'date': "02.09.2021",
        'readTime': "8 Minuten",
        'journal': "National Geographic"
    },

    {
        'title': "Urlaub im All: Das Geschäft mit Reisen ins Weltall zieht an",
        'snippet': "Zig Millionen auf dem Konto und keine Idee, wohin damit? Auf Abenteuerlustige mit schwerem Geldbeutel haben es Anbieter für Ausflüge ins All abgesehen. Raumfahrt-Nationen mischen ebenso mit wie Privatfirmen - als gäbe es keinen Klimawandel.",
        'link': "https://www.stern.de/reise/fernreisen/urlaub-im-all--das-geschaeft-mit-reisen-ins-weltall-zieht-an-31478072.html",
        'date': "09.01.2022",
        'readTime': "3 Minuten",
        'journal': "STERN.de"
    },

    {
        'title': "Schweben statt schwimmen",
        'snippet': "Bislang sind es hauptsächlich Superreiche, die sich einen Weltraumflug leisten können. Und zuletzt ist Weltraumtourismus auch eine gesundheitliche Frage, denn ein Urlaub im All ist etwas grundlegend Anderes als ein Urlaub am Strand. Schwerelosigkeit stellt einen Ausnahmezustand für den Körper dar, der die Reise weitaus unangenehmer macht, als von den meisten Menschen angenommen – und vieles ist aus medizinischer Sicht noch ungewiss.",
        'link': "https://www.derpragmaticus.com/r/weltraumtourismus",
        'date': "23.02.2022",
        'readTime': "12 Minuten",
        'journal': "DER PRAGMATICUS. Fakten. Verstehen. Handeln."
    },

    {
        'title': "Urlaub im All?",
        'snippet': "Reisewarnungen und geschlossene Grenzen – nicht erst seit der Coronapandemie klingt die Vorstellung verlockend, einmal alles auf der Erde hinter sich lassen zu können. Doch wie realistisch ist Space Tourism? ÖAW-Weltraumexperte Günter Kargl erzählt im Interview, wo die Weltraumreise derzeit hingeht – und warum Ferien am Mond Zukunftsmusik bleiben werden.",
        'link': "https://www.oeaw.ac.at/news/urlaub-im-all",
        'date': "28.09.2020",
        'readTime': "4 Minuten",
        'journal': "Österreichische Akadamie der Wissenschaften (ÖAW)"
    }

            ],
            chatbot: [] 
        },
    };

    function formatDate(dateString) {
        const months = {
            "JAN": "01", "FEB": "02", "MÄR": "03", "APR": "04", "MAI": "05", "JUN": "06",
            "JUL": "07", "AUG": "08", "SEP": "09", "OKT": "10", "NOV": "11", "DEZ": "12",
            "JANUARY": "01", "FEBRUARY": "02", "MARCH": "03", "APRIL": "04", "MAY": "05", "JUNE": "06",
            "JULY": "07", "AUGUST": "08", "SEPTEMBER": "09", "OCTOBER": "10", "NOVEMBER": "11", "DECEMBER": "12"
        };

        let match = dateString.match(/([A-ZÄÖÜ]+)\s+(\d{1,2}),?\s+(\d{4})/i);
        if (match) {
            const day = match[2].padStart(2, '0');
            const month = months[match[1].toUpperCase()];
            const year = match[3];
            if (month) return `${day}.${month}.${year}`;
        }

        match = dateString.match(/(\d{1,2})\s*(\.|\s)([A-ZÄÖÜa-z]{3}|\d{1,2})\s*(\.|\s)(\d{4})/);
        if (match) {
            let day = match[1].padStart(2, '0');
            let month = match[3];
            let year = match[5];

            if (isNaN(month)) {
                month = months[month.toUpperCase()];
            } else {
                month = month.padStart(2, '0');
            }
            if (month) return `${day}.${month}.${year}`;
        }

        return dateString;
    }


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
        showLoadingScreen('memes', 'creating'); // Zeigt die "Erstelle Meme..." Nachricht

        showMemeNotification(loadingMessages.memes.creating2, 'loading');

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
                // NEU: Globale Notification aktualisieren
                showMemeNotification("Dein Meme ist fertig!", 'success', true); // Klickbar machen
            } else {
                generatedMemeBuffer = null;
                // NEU: Globale Notification aktualisieren
                showMemeNotification(loadingMessages.memes.allShown, 'info', false); // Nicht klickbar
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
        }, 60000);
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

        if (category === 'videos') {
            const videoMessageDiv = document.createElement('div');
            videoMessageDiv.classList.add('video-top-message');
            videoMessageDiv.innerHTML = `
                <p>Swipe im Videoplayer nach unten, um weitere Kurzvideos zu entdecken.</p>
            `;
            contentArea.appendChild(videoMessageDiv); // Füge die Nachricht zuerst hinzu

            const videoPlayerContainer = document.createElement('div');
            videoPlayerContainer.classList.add('video-player-container');

            const videosToInit = [];

            const videos = shuffleArray([...allThemesContentData[currentThemeKey].videos]);


            videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const playerId = entry.target.querySelector('.youtube-player-placeholder').id;
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

        if (category === 'zeitungsartikel' || category === 'postings') {
            itemsToDisplay = shuffleArray(itemsToDisplay);
        }


        switch (category) {
case 'memes':
            // Prüfe, ob eine Generierung aktiv ist (höchste Priorität, da Ladebildschirm angezeigt werden muss)
            if (isMemeGenerationActive) {
                showLoadingScreen(category, 'creating');
                showMemeNotification(loadingMessages.memes.creating, 'loading');
                return;
            }

            // Prüfe, ob ein Meme im Puffer ist (wurde im Hintergrund generiert und wartet auf Anzeige)
            if (generatedMemeBuffer) {
                contentArea.innerHTML = ''; // Leere den Bereich für das neue Meme
                displayMeme(generatedMemeBuffer); // Zeigt das neue Meme an (und setzt currentDisplayedMeme)
                askForAnotherMemePrompt(); // Fügt den "Noch ein Meme?"-Prompt hinzu
                generatedMemeBuffer = null; // Puffer leeren
                hideMemeNotification(); // Notification ausblenden
                return;
            }

            // Prüfe, ob es ein zuletzt angezeigtes Meme gibt
            if (currentDisplayedMeme) {
                // Überprüfe, ob das Meme bereits im DOM ist, um unnötiges Neurendern zu vermeiden
                const memeImageInDOM = contentArea.querySelector(`img[src="${currentDisplayedMeme.image}"]`);

                if (!memeImageInDOM) {
                    // Wenn das Meme nicht im DOM ist (z.B. nach Kategoriewechsel), render es neu
                    contentArea.innerHTML = ''; // Bereich leeren, bevor das Meme neu hinzugefügt wird
                    displayMeme(currentDisplayedMeme);
                }
                // Füge immer den "Noch ein Meme?"-Prompt oder die "Alle gezeigt"-Nachricht hinzu
                askForAnotherMemePrompt();
                hideMemeNotification(); // Notification ausblenden
                return; // Beende hier, da das Meme nun sichtbar ist und der Prompt korrekt gesetzt wurde
            }

            // Wenn keine der obigen Bedingungen zutrifft (z.B. erster Klick auf Memes, oder alle Memes durch und kein currentDisplayedMeme gespeichert)
            // Dann initialisiere das Array, wenn es leer ist.
            if (memesArrayForGeneration.length === 0) {
                memesArrayForGeneration = shuffleArray(allThemesContentData[currentThemeKey].memes);
            }

            // Zeige den "Möchtest du erstellen?"-Prompt, wenn noch Memes zum Generieren da sind
            if (memesArrayForGeneration.length > 0) {
                showMemeGenerationPrompt();
                hideMemeNotification();
            } else {
                // Alle Memes sind durch und keine weiteren generierbar (und kein currentDisplayedMeme zu zeigen)
                contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                showMemeNotification(loadingMessages.memes.allShown, 'info', false);
            }
            break; // Ende des 'memes'-Case
            case 'postings':
 		itemsToDisplay.forEach(item => {
                    if (item.type === 'twitter') {
                        const tweetWrapper = document.createElement('div');
                        tweetWrapper.classList.add('content-item');
                        tweetWrapper.innerHTML = item.html;
                        contentArea.appendChild(tweetWrapper);
                    }
                });
                loadTwitterWidgets(contentArea);
                break;
            case 'zeitungsartikel':
		 itemsToDisplay.forEach(item => {
                    const articleDiv = document.createElement('div');
                    articleDiv.classList.add('content-item');
                    articleDiv.innerHTML = `
                        <h3>${item.title}</h3>
                        <p>${item.snippet}</p>
                        <p class="article-meta">
                            Veröffentlicht: <strong>${formatDate(item.date)}</strong> |
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
                event.target.setVolume(10);
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
            const videoData = allThemesContentData[currentThemeKey].videos.find(v => v.embedUrl.includes(event.target.getVideoData().video_id));
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
            } else { // Wenn Kategorie bereits geladen
                // NEU: Logik für Memes-Kategorie
                if (category === 'memes') {
                    // Wenn ein Meme bereits fertig generiert wurde (im Puffer)
                    if (generatedMemeBuffer) {
                        displayMeme(generatedMemeBuffer);
                        askForAnotherMemePrompt();
                        generatedMemeBuffer = null;
                        isMemeGenerationActive = false;
                        hideMemeNotification(); // Notification ausblenden, da Meme jetzt angezeigt wird
                    }
                    // Wenn eine Generierung läuft (aber das Meme noch nicht im Puffer ist)
                    else if (isMemeGenerationActive) {
                        showLoadingScreen(category, 'creating');
                        showMemeNotification(loadingMessages.memes.creating, 'loading'); // Notification erneut anzeigen
                    }
                    // Wenn keine Generierung läuft und kein Meme im Puffer ist (alle durch oder erster Klick nach Reset)
                    else {
                        if (memesArrayForGeneration.length === 0) {
                            memesArrayForGeneration = shuffleArray(allThemesContentData[currentThemeKey].memes);
                        }
                        if (memesArrayForGeneration.length > 0) {
                            showMemeGenerationPrompt();
                            hideMemeNotification(); // Notification ausblenden, da der Prompt gezeigt wird
                        } else {
                            contentArea.innerHTML = `<p style="text-align: center; margin-top: 20px;">${loadingMessages.memes.allShown}</p>`;
                            showMemeNotification(loadingMessages.memes.allShown, 'info', false);
                        }
                    }
                } else { // Für alle anderen Kategorien
                    displayContent(category);
                }
            }
        });
    });

    contentArea.innerHTML = '<p>Wähle eine Option, um Beiträge zum Thema Weltraumtourismus zu sehen.</p>';
    resetContentAreaStyles();

    // Initial die Notification verstecken
    hideMemeNotification();
});