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

    // isGloballyMuted wird jetzt primär den Zustand des zuletzt
    // interaktiven Players widerspiegeln (vom Nutzer unmutet oder gemutet).
    // Es wird aber NICHT mehr automatisch die Lautstärke von neu erscheinenden Videos steuern.
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
        // Beim Reset der Content-Area wird der globale Mute-Zustand auf true zurückgesetzt.
        // Das ist wichtig, damit beim nächsten Aufruf der Video-Kategorie alle Videos stumm starten.
        isGloballyMuted = true;
    }

    const volumeUpSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.98 7-4.66 7-8.77s-2.99-7.79-7-8.77z"/></svg>`;
    const volumeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .96-.24 1.86-.65 2.68l1.66 1.66C21.23 14.6 22 13.31 22 12c0-4.07-3.05-7.44-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.98 4.98L3 12v6h4l5 5V12.72L19.73 21 21 19.73 12.27 11 4.27 3zM10 15.27V12.73L12.42 15.15l-2.42.12z"/></svg>`;


    function toggleMute(player, buttonElement) {
        if (player.isMuted()) {
            player.unMute();
            player.setVolume(1); // Setze Lautstärke auf 10% bei Klick auf Unmute
            buttonElement.innerHTML = volumeUpSvg;
            isGloballyMuted = false; // Benutzer hat Ton aktiviert
            console.log(`Player ${player.h.id} unmuted to 10%. isGloballyMuted: ${isGloballyMuted}`);
        } else {
            player.mute();
            buttonElement.innerHTML = volumeOffSvg;
            isGloballyMuted = true; // Benutzer hat Ton deaktiviert
            console.log(`Player ${player.h.id} muted. isGloballyMuted: ${isGloballyMuted}`);
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
                },
                {
                    title: "Der Weltraumtourismus – Der neue Goldrausch!",
                    embedUrl: "https://www.youtube.com/embed/Lnpp7_Plpvc", 
                    description: "vladi_facts"
                },
                {
                    title: "Weltraumtourismus: Wem steht der nächste Start ins All bevor?",
                    embedUrl: "https://www.youtube.com/embed/tiZuKdg-2PA", 
                    description: "Sajoai"
                },
                {
                    title: "Die Aufgaben eines Weltraumtourismus Managers",
                    embedUrl: "https://www.youtube.com/embed/vrz7Wt89gK8", 
                    description: "UnglaublicheFaktenzu"
                },
                {
                    title: "Do You Think Space Tourism is Useless? w/ Brian Cox",
                    embedUrl: "https://www.youtube.com/embed/E8McWcKL27U", 
                    description: "spacein1minute"
                },
                {
                    title: "When Will Space Tourism Be Affordable?",
                    embedUrl: "https://www.youtube.com/embed/cQG-3TtVWlA", 
                    description: "science.and.beyond"
                },
                {
                    title: "Space Tourism's Impact: Women, Overview Effect, and Beyond!",
                    embedUrl: "https://www.youtube.com/embed/qEGcbMtT7pI", 
                    description: "expeditionmoney"
                },
                {
                    title: "The Future of Space Tourism: When Can We Visit Space?",
                    embedUrl: "https://www.youtube.com/embed/qfJLG71yNsQ", 
                    description: "CuriosityaboutFacts-07"
                },
                {
                    title: "Space Tourism: A Reality in the 2030s",
                    embedUrl: "https://www.youtube.com/embed/2iBk8jsy5KU", 
                    description: "TheScience-t3m"
                },
                {
                    title: "Song: Earth – Mirage Onmymind",
                    embedUrl: "https://www.youtube.com/embeded/yXJmMwZqpWQ", 
                    description: "MirageOnmymind"
                },
                {
                    title: "SpaceX Futuristic Space Hotel – The Ultimate Luxury in Orbit!",
                    embedUrl: "https://www.youtube.com/embeded/auPScv7qD9Q", 
                    description: "FuturePulseStation"
                },
                {
                    title: "PropTech Pulse – Ready for a stay that’s truly out of this world?",
                    embedUrl: "https://www.youtube.com/embeded/JCtijrXnq7g", 
                    description: "Aurum_PropTech"
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
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Modern billionaires are the most selfish humans in history.<br><br>Past billionaires:<br><br>- Built libraries<br>- Cured diseases<br>- Advanced civilization.<br><br>Today&#39;s? Space tourism and yacht measuring contests.<br><br>Here&#39s the ugly truth of modern billionaires: 🧵 <a href="https://t.co/eezWg9nF0i">pic.twitter.com/eezWg9nF0i</a></p>&mdash; Logan Weaver (@LogWeaver) <a href="https://twitter.com/LogWeaver/status/1949082214614118440?ref_src=twsrc%5Etfw">July 26, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
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
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Katy Perry says she now looks at Earth through a “whole new perspective” after traveling to space<br><br>She was in space for a total of 11 minutes <a href="https://t.co/3ErSeVJt3d">pic.twitter.com/3ErSeVJt3d</a></p>&mdash; Daily Noud (@DailyNoud) <a href="https://twitter.com/DailyNoud/status/1911819148755149176?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
//neue Beiträge
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Mit dem <a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a> zeigt eine finanzielle Elite ihre krasse Abgehobenheit.<br>Diese Leute wissen nicht wohin mit ihrem Geld.<br>Es ist so absurd, wie ungleich Vermögen auf dieser Welt verteilt sind. Das ist ein Treiber für Extremismus und schadet unserer Demokratie.</p>&mdash; Till Steffen (@till_steffen) <a href="https://twitter.com/till_steffen/status/1912119045605704180?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Unglaublich, was dieser „persönliche Spaß“ einiger dekadenter Promis für Auswirkungen auf das Klima und damit auf die Allgemeinheit hat. 🤮😡<a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a></p>&mdash; Karin Paprotta 🤜🏻🤛🏿 (@KPaprotta) <a href="https://twitter.com/KPaprotta/status/1912095565803823509?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Erstaunlich, wie einig man sich sein kann, dass Bezos seine Raketen hauptsächlich für sein Ego und Weltraumtourismus für Superreiche entwickelt hat, während sein Lieferbusiness auf knallharter Ausbeutung beruht. Aber der böse Milliardär ist Musk. Seufz. Kulturkampf ist halt am… <a href="https://t.co/EZ1EqAaMyy">pic.twitter.com/EZ1EqAaMyy</a></p>&mdash; Der Kommunikator 🔬 (@DrHannesAmon) <a href="https://twitter.com/DrHannesAmon/status/1912073474262118483?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Was sagen eigentlich die <a href="https://twitter.com/KlimaSeniorin?ref_src=twsrc%5Etfw">@KlimaSeniorin</a> dazu? <a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a> <a href="https://twitter.com/hashtag/Feminismus?src=hash&amp;ref_src=twsrc%5Etfw">#Feminismus</a> <a href="https://twitter.com/hashtag/CO2?src=hash&amp;ref_src=twsrc%5Etfw">#CO2</a> <a href="https://twitter.com/hashtag/Klimaschutz?src=hash&amp;ref_src=twsrc%5Etfw">#Klimaschutz</a> <a href="https://twitter.com/amazon?ref_src=twsrc%5Etfw">@amazon</a> -Gründer Jeff Bezos hat eine rein weibliche Besatzung ins All geschickt. 🚀✨🪐 <a href="https://t.co/TxWXYMSZ4i">pic.twitter.com/TxWXYMSZ4i</a></p>&mdash; Sandro Hess, Rheintal (@sandro_w_hess) <a href="https://twitter.com/sandro_w_hess/status/1912108740263674207?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Space-Frage des Tages: Warum könnten Stratosphären-Ballons die Zukunft des Weltraumtourismus sein?<br><br>Antwort: Das spanische Unternehmen Eos X Space hat gerade das amerikanische Startup Space Perspective übernommen, um den Stratosphären-Tourismus zu retten. Stratosphären-Ballons… <a href="https://t.co/AYsqgdnJgl">pic.twitter.com/AYsqgdnJgl</a></p>&mdash; space-magazin (@spacemag2025) <a href="https://twitter.com/spacemag2025/status/1950490299794375110?ref_src=twsrc%5Etfw">July 30, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">ich will keine VR-Brillen, ich will keinen Weltraumtourismus und keine autonomen Autos, ich will dass die Bahnen pünktlich kommen und dass niemand Hunger hat</p>&mdash; E L H O T Z O (@elhotzo) <a href="https://twitter.com/elhotzo/status/1675098356006236160?ref_src=twsrc%5Etfw">July 1, 2023</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Thema Weltraumtourismus <a href="https://t.co/MBcUQYkEZv">pic.twitter.com/MBcUQYkEZv</a></p>&mdash; Der Elfenbeinturm (@MontyDelMuro) <a href="https://twitter.com/MontyDelMuro/status/1911878374374375750?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraumtourismus gehört wirklich zum Dümmsten, was die Menschheit erfunden hat. Die Raumfahrt wurde schließlich nicht erfunden, um B-Promis und neurotische Milliardäre mit viel Energie und auf Kosten der Umwelt ins All zu schießen.</p>&mdash; S Mueller-Kraenner (@sascha_m_k) <a href="https://twitter.com/sascha_m_k/status/1912013769376415983?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Bezos Rückkehr in den Weltraumtourismus endet mit einer Fallschirmpanne <a href="https://t.co/KZnwEZOizm">https://t.co/KZnwEZOizm</a> <a href="https://t.co/eEATRc2MFx">pic.twitter.com/eEATRc2MFx</a></p>&mdash; WELT (@welt) <a href="https://twitter.com/welt/status/1792241683083489308?ref_src=twsrc%5Etfw">May 19, 2024</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Der britische Milliardär wollte den Weltraumtourismus revolutionieren. Jetzt braucht seine Firma ein ganz neues Raumschiff, weil das alte doch nichts taugt. Ist das der Anfang vom Ende? <a href="https://t.co/sG6o6yHC24">https://t.co/sG6o6yHC24</a></p>&mdash; DER SPIEGEL (@derspiegel) <a href="https://twitter.com/derspiegel/status/1734859339394158668?ref_src=twsrc%5Etfw">December 13, 2023</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Schlichte Frage: Wie verträgt sich Musks Forderung nach CO2-Reduktion durch Besteuerung mit tausenden <a href="https://twitter.com/hashtag/Starlink?src=hash&amp;ref_src=twsrc%5Etfw">#Starlink</a>-Satelliten, die er ins All schießen lässt, Mars-Missionen und Weltraumtourismus als Geschäftsmodell?<a href="https://twitter.com/hashtag/ElonMusk?src=hash&amp;ref_src=twsrc%5Etfw">#ElonMusk</a> <a href="https://t.co/Fu42TeOP5y">https://t.co/Fu42TeOP5y</a></p>&mdash; Michael Esders (@MichaelEsders) <a href="https://twitter.com/MichaelEsders/status/1814884461902737901?ref_src=twsrc%5Etfw">July 21, 2024</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Bericht: Warum ist Weltraumtourismus problematisch?<a href="https://t.co/11MPqOInsA">https://t.co/11MPqOInsA</a><a href="https://twitter.com/hashtag/technologie?src=hash&amp;ref_src=twsrc%5Etfw">#technologie</a> <a href="https://twitter.com/hashtag/raumfahrt?src=hash&amp;ref_src=twsrc%5Etfw">#raumfahrt</a> <a href="https://twitter.com/hashtag/weltraum?src=hash&amp;ref_src=twsrc%5Etfw">#weltraum</a> <a href="https://twitter.com/hashtag/umwelt?src=hash&amp;ref_src=twsrc%5Etfw">#umwelt</a> <a href="https://twitter.com/hashtag/nachhaltig?src=hash&amp;ref_src=twsrc%5Etfw">#nachhaltig</a> <a href="https://twitter.com/hashtag/tourismus?src=hash&amp;ref_src=twsrc%5Etfw">#tourismus</a> <a href="https://t.co/HO0ZA8W9Qu">pic.twitter.com/HO0ZA8W9Qu</a></p>&mdash; Chris G. (@artdefects) <a href="https://twitter.com/artdefects/status/1920434531422642680?ref_src=twsrc%5Etfw">May 8, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
},
{
    'type': 'twitter',
    'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism needs urgent regulation-we don&#39;t need another source of emission.<br><br>Air Pollution Caused By Space Launches Needs Urgent Attention <a href="https://t.co/OnFAf02SoE">https://t.co/OnFAf02SoE</a></p>&mdash; Reena Gupta (@Reena_Guptaa) <a href="https://twitter.com/Reena_Guptaa/status/1962061428371964255?ref_src=twsrc%5Etfw">August 31, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
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
    },
    {
        'title': "Weltraumtourismus, der neue Trend",
        'snippet': "Weltraumtourismus ist mehr als ein PR-Gag für Superreiche. Er markiert einen Paradigmenwechsel in der Raumfahrt: von staatlich gelenkter Forschung zu kommerziell geprägter Exploration. Auch wenn heute nur Wenige teilnehmen können, werden die technologischen Fortschritte, die Wettbewerbsdynamik und das wachsende Interesse auf lange Sicht dafür sorgen, dass das All immer näher rückt – nicht nur physisch, sondern auch emotional und kulturell.",
        'link': "https://finanzkun.de/artikel/weltraumtourismus-der-neue-trend/",
        'date': "11.04.2025",
        'readTime': "4 Minuten",
        'journal': "FinanzKun.de kompetent.transparent.informativ."
    },
    {
        'title': "Müssen wir zuerst die Probleme auf der Erde lösen bevor wir uns auf den Weg in den Weltraum machen?",
        'snippet': "Kurz gesagt: Ich bin der Meinung, dass sich die Frage „Müssen wir zuerst die Probleme auf der Erde lösen bevor wir uns auf den Weg in den Weltraum machen?“ gar nicht erst stellt. Wir müssen die Probleme lösen, ja! Aber der Weg spielt keine Rolle. Die Ressourcen die wir in eine etwaige Erforschung des Weltraums stecken sind nicht verschwendet, weil sie am Ende dabei helfen, die Probleme auf der Erde zu lösen. Und umgekehrt gilt das gleiche. Je mehr Wege wir bei der Lösung dieser Probleme verfolgen, desto besser! Und am Ende waren wir Menschen immer dann am erfolgreichsten, wenn wir unserer Neugier und unserer Faszination gefolgt sind…",
        'link': "https://astrodicticum-simplex.at/2017/03/muessen-wir-zuerst-die-probleme-auf-der-erde-loesen-bevor-wir-uns-auf-den-weg-in-den-weltraum-machen/",
        'date': "20.03.2017",
        'readTime': "3 Minuten",
        'journal': "Astrodicticum Simplex"
    },
    {
        'title': "Die Rolle des Weltraumtourismus in der modernen Raumfahrt",
        'snippet': "Der Weltraumtourismus spricht sowohl innere Antriebe wie Neugier und den Wunsch nach Ruhm an, als auch äußere Reize wie die Aussicht auf die Erde aus dem All und das Gefühl der Schwerelosigkeit. Diese Kombination aus inneren und äußeren Faktoren macht den Reiz des Weltraumtourismus aus.",
        'link': "https://www.it-boltwise.de/die-rolle-des-weltraumtourismus-in-der-modernen-raumfahrt.html",
        'date': "19.05.2025",
        'readTime': "3 Minuten",
        'journal': "IT BOLTWISE"
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
            // NEU: Klarer Hinweis für den Benutzer, besonders für iOS
            videoMessageDiv.innerHTML = `
                <p>Swipe im Videoplayer nach unten, um weitere Kurzvideos zu entdecken.</p>
                <p class="ios-hint" style="font-size: 0.9em; margin-top: 10px; color: #ced4da;">(Videos starten immer stumm. Tippen Sie den Lautstärke-Button an, um den Ton auf 10% einzuschalten.)</p>
            `;
            contentArea.appendChild(videoMessageDiv);

            const videoPlayerContainer = document.createElement('div');
            videoPlayerContainer.classList.add('video-player-container');

            const videosToInit = [];

            const videos = shuffleArray([...allThemesContentData[currentThemeKey].videos]);


            videoIntersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const playerPlaceholder = entry.target.querySelector('.youtube-player-placeholder');
                    if (!playerPlaceholder) return; // Überspringen, wenn Platzhalter nicht gefunden
                    const playerId = playerPlaceholder.id;
                    const player = youtubePlayers[playerId];

                    if (!player || !player.muteButtonElement) {
                        console.warn(`Player ${playerId} oder zugehörige Buttons nicht gefunden oder nicht bereit für IntersectionObserver.`);
                        return;
                    }

                    if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                        // Video ist in den Sichtbereich gekommen
                        if (currentPlayingVideoPlayer && currentPlayingVideoPlayer !== player) {
                            // Vorheriges Video pausieren und stummschalten
                            console.log(`Pausing and muting previous player ${currentPlayingVideoPlayer.h.id}`);
                            currentPlayingVideoPlayer.pauseVideo();
                            currentPlayingVideoPlayer.mute();
                            if (currentPlayingVideoPlayer.muteButtonElement) {
                                currentPlayingVideoPlayer.muteButtonElement.innerHTML = volumeOffSvg;
                            }
                            currentPlayingVideoPlayer.seekTo(0); // Optional: Video zurückspulen
                        }

                        if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                            console.log(`Playing player ${playerId} (scrolled into view).`);
                            player.playVideo();
                            currentPlayingVideoPlayer = player;

                            // Neues Video immer stumm starten
                            player.mute();
                            if (player.muteButtonElement) {
                                player.muteButtonElement.innerHTML = volumeOffSvg; // Button zeigt "Ton einschalten"
                            }
                        }
                    } else if (!entry.isIntersecting && player.getPlayerState() === YT.PlayerState.PLAYING) {
                        // Video hat den Sichtbereich verlassen
                        console.log(`Pausing and muting player ${playerId} because it's out of view.`);
                        player.pauseVideo();
                        // Immer stummschalten, wenn es den Sichtbereich verlässt (egal ob vorher an oder aus)
                        player.mute();
                        if (player.muteButtonElement) {
                            player.muteButtonElement.innerHTML = volumeOffSvg;
                        }
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
                muteButton.innerHTML = volumeOffSvg; // Videos starten immer stumm, Button zeigt "Ton an"
                videoControlsDiv.appendChild(muteButton);

                videoSlide.innerHTML = `
                    <div id="${uniquePlayerId}" class="youtube-player-placeholder"></div>
                `;
                videoSlide.appendChild(videoControlsDiv);
                videoPlayerContainer.appendChild(videoSlide);

                videosToInit.push({
                    id: uniquePlayerId,
                    videoId: item.embedUrl.split('/').pop().split('?')[0],
                    autoplay: false, // Autoplay wird durch IntersectionObserver gesteuert
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

            // Initiales Starten des ersten Videos, wenn die VideosToInit Liste nicht leer ist
            if (videosToInit.length > 0) {
                setTimeout(() => {
                    const firstVideoData = videosToInit[0];
                    const firstVideoPlayer = youtubePlayers[firstVideoData.id];
                    if (firstVideoPlayer && typeof firstVideoPlayer.playVideo === 'function') {
                        console.log('Manually playing first video (initial load).');
                        firstVideoPlayer.playVideo();
                        currentPlayingVideoPlayer = firstVideoPlayer;

                        // Immer stummschalten beim initialen Start
                        firstVideoPlayer.mute();
                        if (firstVideoPlayer.muteButtonElement) {
                            firstVideoPlayer.muteButtonElement.innerHTML = volumeOffSvg;
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
                mute: 1, // Videos starten IMMER stummgeschaltet, damit Autoplay auf iOS funktioniert
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

        player.muteButtonElement = videoData.muteButton; // Referenz speichern

        console.log(`Player ${videoData.id} initialization attempted for video ID ${videoData.videoId}.`);
    }

    function onPlayerReady(event, muteButtonElement) {
        console.log(`Player ${event.target.h.id} is ready.`);
        if (muteButtonElement) {
            muteButtonElement.addEventListener('click', () => toggleMute(event.target, muteButtonElement));
            // Beim Ready-Event IMMER stummschalten und Mute-Button auf "Ton an" setzen
            event.target.mute();
            muteButtonElement.innerHTML = volumeOffSvg;
            console.log(`Player ${event.target.h.id} ready: Force muted.`);
        }
    }

    function onPlayerStateChange(event, muteButtonElement) {
        const playerId = event.target.h.id;
        const player = youtubePlayers[playerId];

        if (muteButtonElement) {
            // Dies aktualisiert den Button-Zustand basierend auf dem tatsächlichen Player-Zustand.
            if (player.isMuted()) {
                muteButtonElement.innerHTML = volumeOffSvg;
            } else {
                muteButtonElement.innerHTML = volumeUpSvg;
            }
        }

        // Wenn das Video endet, soll es stumm weiterlaufen (loop:1)
        // Aber hier explizit sicherstellen, dass es gemutet bleibt
        if (event.data === YT.PlayerState.ENDED) {
            event.target.playVideo(); // Führt zum Loop, wenn playerVars.loop=1
            event.target.mute(); // Sicherstellen, dass der Loop stumm ist
            if (muteButtonElement) {
                muteButtonElement.innerHTML = volumeOffSvg;
            }
            console.log(`Player ${playerId} ended and looped, now muted.`);
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
