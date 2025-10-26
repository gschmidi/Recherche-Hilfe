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

    const currentThemeKey = themeInput.value.toLowerCase();

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
                    description: "Weltraumdanger"
                },
                {
                    title: "Space Tourism: are we one step closer?",
                    embedUrl: "https://www.youtube.com/embed/RoJcfr_VKPU", 
                    description: " BBC My World"
                },
                {
                    title: " The Gross Problem With Space Tourism ",
                    embedUrl: "https://www.youtube.com/embed/05bH8DfUukQ", 
                    description: "Neil deGrasse Tyson answers the question: What obstacles will space tourism face? "
                },
                {
                    title: "That was so lucky",
                    embedUrl: "https://www.youtube.com/embed/wCmZ4MCr4nY", 
                    description: "-"
                },
                {
                    title: "Neil deGrasse | PRINCE WILLIAMS ABOUT SPACE TOURISM",
                    embedUrl: "https://www.youtube.com/embed/dfo1SM6Vn8U", 
                    description: "-"
                },
                {
                    title: "How much carbon did the Blue Origin rocket emit?",
                    embedUrl: "https://www.youtube.com/embed/p8vYgVuU-OY", 
                    description: "-"
                },
                {
                    title: "Is Rocket Launch Harmful To the Environment ",
                    embedUrl: "https://www.youtube.com/embed/RkKCReD4quc", 
                    description: "-"
                },
                {
                    title: "Rocket Launches Are Destroying Our Ozone Layer Protection",
                    embedUrl: "https://www.youtube.com/embed/IaCfW-H9UF4", 
                    description: ""
                },
                {
                    title: "Rocket Pollution: The Next Environmental Crisis",
                    embedUrl: "https://www.youtube.com/embed/9J_DU1xxgi4", 
                    description: "-"
                },
                {
                    title: "Hydrogen is worse for the environment than traditional rocket fuel",
                    embedUrl: "https://www.youtube.com/embed/h20qgxq-fE8", 
                    description: ""
                },
                {
                    title: "The Problem With Space Junk",
                    embedUrl: "https://www.youtube.com/embed/YIQ41rkTVCU", 
                    description: ""
                },
                {
                    title: "Kessler-Syndrom: Zerstört Weltraumschrott unsere Zukunft?",
                    embedUrl: "https://www.youtube.com/embed/VDXdJKP-ZEw", 
                    description: ""
                },
                {
                    title: "Most terrific Rocket explosions ever occurred",
                    embedUrl: "https://www.youtube.com/embed/JqwjIQjtzVI", 
                    description: ""
                },

                {
                    title: "Compilation of Space Rocket Launch Failures and Explosions",
                    embedUrl: "https://www.youtube.com/embed/8A8Jgf_Qqtw", 
                    description: ""
                }

            ],
            postings: [
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">&quot;katy perry going to space!!&quot; <br>The actual trip: <a href="https://t.co/JK4mOyuiKY">pic.twitter.com/JK4mOyuiKY</a></p>&mdash; solcito (@_valkyriecroft) <a href="https://twitter.com/_valkyriecroft/status/1911766192647287039?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">"Katy Perry fliegt ins All!!" <br>Die eigentliche Reise: <a href="https://t.co/JK4mOyuiKY">pic.twitter.com/JK4mOyuiKY</a></p>&mdash; solcito (@_valkyriecroft) <a href="https://twitter.com/_valkyriecroft/status/1911766192647287039?ref_src=twsrc%5Etfw">April 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism is not space exploration<br>its beginning of a new fossil fuel powered business for billionaires to get their kicks in space, watching the spectacle of a burnt out and flooded Earth, as they fuel even more emissions</p>&mdash; GO GREEN (@ECOWARRIORSS) <a href="https://twitter.com/ECOWARRIORSS/status/1419332100008955907?ref_src=twsrc%5Etfw">July 25, 2021</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraumtourismus ist keine Weltraumforschung<br>es ist der Beginn eines neuen, mit fossilen Brennstoffen betriebenen Geschäfts für Milliardäre, um ihren Kick im Weltraum zu bekommen, während sie das Schauspiel einer ausgebrannten und überfluteten Erde beobachten, da sie noch mehr Emissionen verursachen</p>&mdash; GO GREEN (@ECOWARRIORSS) <a href="https://twitter.com/ECOWARRIORSS/status/1419332100008955907?ref_src=twsrc%5Etfw">July 25, 2021</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Modern billionaires are the most selfish humans in history.<br><br>Past billionaires:<br><br>- Built libraries<br>- Cured diseases<br>- Advanced civilization.<br><br>Today&#39;s? Space tourism and yacht measuring contests.<br><br>Here&#39s the ugly truth of modern billionaires: 🧵 <a href="https://t.co/eezWg9nF0i">pic.twitter.com/eezWg9nF0i</a></p>&mdash; Logan Weaver (@LogWeaver) <a href="https://twitter.com/LogWeaver/status/1949082214614118440?ref_src=twsrc%5Etfw">July 26, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Moderne Milliardäre sind die egoistischsten Menschen der Geschichte.<br><br>Frühere Milliardäre:<br><br>- Bauten Bibliotheken<br>- Heilten Krankheiten<br>- Brachten die Zivilisation voran.<br><br>Die heutigen? Weltraumtourismus und Yacht-Messwettbewerbe.<br><br>Hier ist die hässliche Wahrheit über moderne Milliardäre: 🧵 <a href="https://t.co/eezWg9nF0i">pic.twitter.com/eezWg9nF0i</a></p>&mdash; Logan Weaver (@LogWeaver) <a href="https://twitter.com/LogWeaver/status/1949082214614118440?ref_src=twsrc%5Etfw">July 26, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism: Rockets emit 100 times more CO2 per passenger than flights – imagine a whole industry <a href="https://t.co/ypqinXj77k">https://t.co/ypqinXj77k</a> <a href="https://t.co/xJtHTV6jWy">pic.twitter.com/xJtHTV6jWy</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/1419764070119579655?ref_src=twsrc%5Etfw">July 26, 2021</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraumtourismus: Raketen emittieren 100-mal mehr CO2 pro Passagier als Flüge – stellen Sie sich eine ganze Industrie vor <a href="https://t.co/ypqinXj77k">https://t.co/ypqinXj77k</a> <a href="https://t.co/xJtHTV6jWy">pic.twitter.com/xJtHTV6jWy</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/1419764070119579655?ref_src=twsrc%5Etfw">July 26, 2021</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Mit dem <a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a> zeigt eine finanzielle Elite ihre krasse Abgehobenheit.<br>Diese Leute wissen nicht wohin mit ihrem Geld.<br>Es ist so absurd, wie ungleich Vermögen auf dieser Welt verteilt sind. Das ist ein Treiber für Extremismus und schadet unserer Demokratie.</p>&mdash; Till Steffen (@till_steffen) <a href="https://twitter.com/till_steffen/status/1912119045605704180?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Unglaublich, was dieser „persönliche Spaß“ einiger dekadenter Promis für Auswirkungen auf das Klima und damit auf die Allgemeinheit hat. 🤮😡<a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a></p>&mdash; Karin Paprotta 🤜🏻🤛🏿 (@KPaprotta) <a href="https://twitter.com/KPaprotta/status/1912095565803823509?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Erstaunlich, wie einig man sich sein kann, dass Bezos seine Raketen hauptsächlich für sein Ego und Weltraumtourismus für Superreiche entwickelt hat, während sein Lieferbusiness auf knallharter Ausbeutung beruht. Aber der böse Milliardär ist Musk. Seufz. Kulturkampf ist halt am… <a href="https://t.co/EZ1EqAaMyy">pic.twitter.com/EZ1EqAaMyy</a></p>&mdash; Der Kommunikator 🔬 (@DrHannesAmon) <a href="https://twitter.com/DrHannesAmon/status/1912073474262118483?ref_src=twsrc%5Etfw">April 15, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Was sagen eigentlich die <a href="https://twitter.com/KlimaSeniorin?ref_src=twsrc%5Etfw">@KlimaSeniorin</a> dazu? <a href="https://twitter.com/hashtag/Weltraumtourismus?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a> <a href="https://twitter.com/hashtag/Feminismus?src=hash&amp;ref_src=twsrc%5Etfw">#Feminismus</a> <a href="https://twitter.com/hashtag/CO2?src=hash&amp;ref_src=twsrc%5Etfw">#CO2</a> <a href="https://twitter.com/hashtag/Klimaschutz?src=hash&amp;ref_src=twsrc%5Etfw">#Klimaschutz</a> <a href="https://twitter.com/amazon?ref_src=twsrc%5Etfw">@amazon</a> -Gründer Jeff Bezos hat eine rein weibliche Besatzung ins All geschickt. 🚀✨🪐 <a href="https://t.co/TxWXYMSZ4i">pic.twitter.com/TxWXYMSZ4i</a></p>&mdash; Sandro Hess, Rheintal (@sandro_w_hess) <a href="https://twitter.com/sandro_w_hess/status/1912108740263674207?ref_src=twsrc%5Etfw">April 15, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">ich will keine VR-Brillen, ich will keinen Weltraumtourismus und keine autonomen Autos, ich will dass die Bahnen pünktlich kommen und dass niemand Hunger hat</p>&mdash; E L H O T Z O (@elhotzo) <a href="https://twitter.com/elhotzo/status/1675098356006236160?ref_src=twsrc%5Etfw">July 1, 2023</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Thema Weltraumtourismus <a href="https://t.co/MBcUQYkEZv">pic.twitter.com/MBcUQYkEZv</a></p>&mdash; Der Elfenbeinturm (@MontyDelMuro) <a href="https://twitter.com/MontyDelMuro/status/1911878374374375750?ref_src=twsrc%5Etfw">April 14, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraumtourismus gehört wirklich zum Dümmsten, was die Menschheit erfunden hat. Die Raumfahrt wurde schließlich nicht erfunden, um B-Promis und neurotische Milliardäre mit viel Energie und auf Kosten der Umwelt ins All zu schießen.</p>&mdash; S Mueller-Kraenner (@sascha_m_k) <a href="https://twitter.com/sascha_m_k/status/1912013769376415983?ref_src=twsrc%5Etfw">April 15, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Bezos Rückkehr in den Weltraumtourismus endet mit einer Fallschirmpanne <a href="https://t.co/KZnwEZOizm">https://t.co/KZnwEZOizm</a> <a href="https://t.co/eEATRc2MFx">pic.twitter.com/eEATRc2MFx</a></p>&mdash; WELT (@welt) <a href="https://twitter.com/welt/status/1792241683083489308?ref_src=twsrc%5Etfw">May 19, 2024</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Der britische Milliardär wollte den Weltraumtourismus revolutionieren. Jetzt braucht seine Firma ein ganz neues Raumschiff, weil das alte doch nichts taugt. Ist das der Anfang vom Ende? <a href="https://t.co/sG6o6yHC24">https://t.co/sG6o6yHC24</a></p>&mdash; DER SPIEGEL (@derspiegel) <a href="https://twitter.com/derspiegel/status/1734859339394158668?ref_src=twsrc%5Etfw">December 13, 2023</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Schlichte Frage: Wie verträgt sich Musks Forderung nach CO2-Reduktion durch Besteuerung mit tausenden <a href="https://twitter.com/hashtag/Starlink?src=hash&amp;ref_src=twsrc%5Etfw">#Starlink</a>-Satelliten, die er ins All schießen lässt, Mars-Missionen und Weltraumtourismus als Geschäftsmodell?<a href="https://twitter.com/hashtag/ElonMusk?src=hash&amp;ref_src=twsrc%5Etfw">#ElonMusk</a> <a href="https://t.co/Fu42TeOP5y">https://t.co/Fu42TeOP5y</a></p>&mdash; Michael Esders (@MichaelEsders) <a href="https://twitter.com/MichaelEsders/status/1814884461902737901?ref_src=twsrc%5Etfw">July 21, 2024</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Bericht: Warum ist Weltraumtourismus problematisch?<a href="https://t.co/11MPqOInsA">https://t.co/11MPqOInsA</a><a href="https://twitter.com/hashtag/technologie?src=hash&amp;ref_src=twsrc%5Etfw">#technologie</a> <a href="https://twitter.com/hashtag/raumfahrt?src=hash&amp;ref_src=twsrc%5Etfw">#raumfahrt</a> <a href="https://twitter.com/hashtag/weltraum?src=hash&amp;ref_src=twsrc%5Etfw">#weltraum</a> <a href="https://twitter.com/hashtag/umwelt?src=hash&amp;ref_src=twsrc%5Etfw">#umwelt</a> <a href="https://twitter.com/hashtag/nachhaltig?src=hash&amp;ref_src=twsrc%5Etfw">#nachhaltig</a> <a href="https://twitter.com/hashtag/tourismus?src=hash&amp;ref_src=twsrc%5Etfw">#tourismus</a> <a href="https://t.co/HO0ZA8W9Qu">pic.twitter.com/HO0ZA8W9Qu</a></p>&mdash; Chris G. (@artdefects) <a href="https://twitter.com/artdefects/status/1920434531422642680?ref_src=twsrc%5Etfw">May 8, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space tourism needs urgent regulation-we don&#39;t need another source of emission.<br><br>Air Pollution Caused By Space Launches Needs Urgent Attention <a href="https://t.co/OnFAf02SoE">https://t.co/OnFAf02SoE</a></p>&mdash; Reena Gupta (@Reena_Guptaa) <a href="https://twitter.com/Reena_Guptaa/status/1962061428371964255?ref_src=twsrc%5Etfw">August 31, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraumtourismus benötigt dringende Regulierung – wir brauchen keine weitere Emissionsquelle.<br><br>Luftverschmutzung durch Weltraumstarts braucht dringende Aufmerksamkeit <a href="https://t.co/OnFAf02SoE">https://t.co/OnFAf02SoE</a></p>&mdash; Reena Gupta (@Reena_Guptaa) <a href="https://twitter.com/Reena_Guptaa/status/1962061428371964255?ref_src=twsrc%5Etfw">August 31, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Stell dir vor,du willst Millionen für die Weltraumforschung investieren,bist aber nicht im stande Krankenhäuser,Flughäfen,Bundeswehrstandorte ja sogar irgendwelche Gebäude von Landesregierungen zu schützen bzw zu sichern🤔😳🤫🥳🤡noch irgendwelche Fragen😉🤪🤭😂🤣😅🫡😎 <a href="https://t.co/8GELw90I8f">pic.twitter.com/8GELw90I8f</a></p>&mdash; Saško T 🦅 (@tancredi1974) <a href="https://twitter.com/tancredi1974/status/1974493910702408178?ref_src=twsrc%5Etfw">October 4, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">This happened yesterday?? And I’m just now learning about it??<br><br>MAJOR ROCKET EXPLOSION <br>A small town just North of Austin was rocked when a rocket at a research facility exploded during a test. <a href="https://t.co/XVEAN6UmdG">pic.twitter.com/XVEAN6UmdG</a></p>&mdash; Samantha (@SparklinJewel23) <a href="https://twitter.com/SparklinJewel23/status/1973178935082098772?ref_src=twsrc%5Etfw">October 1, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Das ist gestern passiert?? Und ich erfahre es erst jetzt??<br><br>GROSSE RAKETENEXPLOSION <br>Eine Kleinstadt nördlich von Austin wurde erschüttert, als eine Rakete in einer Forschungsanlage während eines Tests explodierte. <a href="https://t.co/XVEAN6UmdG">pic.twitter.com/XVEAN6UmdG</a></p>&mdash; Samantha (@SparklinJewel23) <a href="https://twitter.com/SparklinJewel23/status/1973178935082098772?ref_src=twsrc%5Etfw">October 1, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Japan&#39;s Space One rocket explodes soon after launch <a href="https://t.co/qt3CrgcFvC">pic.twitter.com/qt3CrgcFvC</a></p>&mdash; Pubity (@pubity) <a href="https://twitter.com/pubity/status/1767808807407624407?ref_src=twsrc%5Etfw">March 13, 2024</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Japans Space One Rakete explodiert kurz nach dem Start <a href="https://t.co/qt3CrgcFvC">pic.twitter.com/qt3CrgcFvC</a></p>&mdash; Pubity (@pubity) <a href="https://twitter.com/pubity/status/1767808807407624407?ref_src=twsrc%5Etfw">March 13, 2024</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Dramatic Video Shows Huge Scale of <a href="https://twitter.com/hashtag/SpaceX?src=hash&amp;ref_src=twsrc%5Etfw">#SpaceX</a> Rocket Explosion <a href="https://t.co/l2YpeE6LrS">https://t.co/l2YpeE6LrS</a> <a href="https://t.co/jaM9bnbpYG">pic.twitter.com/jaM9bnbpYG</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/771522817267412993?ref_src=twsrc%5Etfw">September 2, 2016</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Dramatisches Video zeigt das Ausmaß der #SpaceX Raketenexplosion <a href="https://t.co/l2YpeE6LrS">https://t.co/l2YpeE6LrS</a> <a href="https://t.co/jaM9bnbpYG">pic.twitter.com/jaM9bnbpYG</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/771522817267412993?ref_src=twsrc%5Etfw">September 2, 2016</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Watch the moment an unmanned NASA rocket explodes, seconds after launch. <a href="http://t.co/YpmthjmUBv">http://t.co/YpmthjmUBv</a> <a href="http://t.co/qQAPrlxmbV">pic.twitter.com/qQAPrlxmbV</a></p>&mdash; CNN International (@cnni) <a href="https://twitter.com/cnni/status/527246423771738112?ref_src=twsrc%5Etfw">October 28, 2014</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Sehen Sie den Moment, in dem eine unbemannte NASA-Rakete Sekunden nach dem Start explodiert. <a href="http://t.co/YpmthjmUBv">http://t.co/YpmthjmUBv</a> <a href="http://t.co/qQAPrlxmbV">pic.twitter.com/qQAPrlxmbV</a></p>&mdash; CNN International (@cnni) <a href="https://twitter.com/cnni/status/527246423771738112?ref_src=twsrc%5Etfw">October 28, 2014</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">SpaceX satellites&#39; reentries raise atmospheric damage concerns <a href="https://t.co/Ic4oco2Ipr">https://t.co/Ic4oco2Ipr</a> <a href="https://t.co/wXEhaWn87I">pic.twitter.com/wXEhaWn87I</a></p>&mdash; Ticker (@tickercotweets) <a href="https://twitter.com/tickercotweets/status/1977095077999809015?ref_src=twsrc%5Etfw">October 11, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Der Wiedereintritt von SpaceX-Satelliten gibt Anlass zu Bedenken hinsichtlich atmosphärischer Schäden <a href="https://t.co/Ic4oco2Ipr">https://t.co/Ic4oco2Ipr</a> <a href="https://t.co/wXEhaWn87I">pic.twitter.com/wXEhaWn87I</a></p>&mdash; Ticker (@tickercotweets) <a href="https://twitter.com/tickercotweets/status/1977095077999809015?ref_src=twsrc%5Etfw">October 11, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">“They’re Turning Space Into a Junkyard”: This Alarming Satellite Crisis Could Make Earth’s Orbit Too Dangerous to Use (and it’s already happening)<a href="https://t.co/PuVQW4VYmg">https://t.co/PuVQW4VYmg</a> <a href="https://t.co/NZJQB6cqbY">pic.twitter.com/NZJQB6cqbY</a></p>&mdash; 🌏PEACE✌️☮️🕊♻️☘️ (@PeaceOutPeaceIn) <a href="https://twitter.com/PeaceOutPeaceIn/status/1979176867140624564?ref_src=twsrc%5Etfw">October 17, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">„Sie verwandeln den Weltraum in einen Schrottplatz“: Diese alarmierende Satellitenkrise könnte die Erdumlaufbahn zu gefährlich machen (und es geschieht bereits)<a href="https://t.co/PuVQW4VYmg">https://t.co/PuVQW4VYmg</a> <a href="https://t.co/NZJQB6cqbY">pic.twitter.com/NZJQB6cqbY</a></p>&mdash; 🌏PEACE✌️☮️🕊♻️☘️ (@PeaceOutPeaceIn) <a href="https://twitter.com/PeaceOutPeaceIn/status/1979176867140624564?ref_src=twsrc%5Etfw">October 17, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">“Space Junk,” John Berkey, a 1979 Life Magazine illustration <a href="https://t.co/8AizlKuKAU">pic.twitter.com/8AizlKuKAU</a></p>&mdash; 70s Sci-Fi Art (@70sscifi) <a href="https://twitter.com/70sscifi/status/1330245671614619652?ref_src=twsrc%5Etfw">November 21, 2020</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">„Weltraummüll“, John Berkey, eine Illustration aus dem Life Magazine von 1979 <a href="https://t.co/8AizlKuKAU">pic.twitter.com/8AizlKuKAU</a></p>&mdash; 70s Sci-Fi Art (@70sscifi) <a href="https://twitter.com/70sscifi/status/1330245671614619652?ref_src=twsrc%5Etfw">November 21, 2020</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Space junk as small 0.04 inches, traveling up to 10 miles per second, can create significant damage to a spacecraft: <a href="https://t.co/OE35so5WRq">https://t.co/OE35so5WRq</a> <a href="https://t.co/xXvswsDsvQ">pic.twitter.com/xXvswsDsvQ</a></p>&mdash; NASA (@NASA) <a href="https://twitter.com/NASA/status/802919166701408256?ref_src=twsrc%5Etfw">November 27, 2016</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Weltraummüll, nur 0,04 Zoll klein, der sich mit bis zu 10 Meilen pro Sekunde bewegt, kann erhebliche Schäden an einem Raumschiff verursachen: <a href="https://t.co/OE35so5WRq">https://t.co/OE35so5WRq</a> <a href="https://t.co/xXvswsDsvQ">pic.twitter.com/xXvswsDsvQ</a></p>&mdash; NASA (@NASA) <a href="https://twitter.com/NASA/status/802919166701408256?ref_src=twsrc%5Etfw">November 27, 2016</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">An Orbiting Garbage Collector That Eats Space Junk To Fuel Itself <a href="https://t.co/yM2vf9T7ob">https://t.co/yM2vf9T7ob</a> <a href="https://t.co/6srf3GXsUo">pic.twitter.com/6srf3GXsUo</a></p>&mdash; Popular Science (@PopSci) <a href="https://twitter.com/PopSci/status/795160061928763392?ref_src=twsrc%5Etfw">November 6, 2016</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Ein Müllsammler im Orbit, der Weltraummüll frisst, um sich selbst anzutreiben <a href="https://t.co/yM2vf9T7ob">https://t.co/yM2vf9T7ob</a> <a href="https://t.co/6srf3GXsUo">pic.twitter.com/6srf3GXsUo</a></p>&mdash; Popular Science (@PopSci) <a href="https://twitter.com/PopSci/status/795160061928763392?ref_src=twsrc%5Etfw">November 6, 2016</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">I covered in extensive detail why space travel is so inhospitable to homo sapiens<br><br>It is the quickest way by FAR to induce massive mitochondrial dysfunction by simultaneous<br><br>- cosmic radiation bombardment<br>- light stress from LEDs<br>- deficiency of magnetic fields, gravity… <a href="https://t.co/5BPV5eQBwx">https://t.co/5BPV5eQBwx</a></p>&mdash; Max Gulhane MD (@MaxGulhaneMD) <a href="https://twitter.com/MaxGulhaneMD/status/1977900861167972365?ref_src=twsrc%5Etfw">October 14, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Ich habe ausführlich dargelegt, warum Raumfahrt für den Homo sapiens so unwirtlich ist.<br><br>Es ist bei Weitem der schnellste Weg, um massive mitochondriale Dysfunktion durch gleichzeitige<br><br>- kosmische Strahlenbelastung<br>- Lichtstress durch LEDs<br>- Mangel an Magnetfeldern, Schwerkraft… <a href="https://t.co/5BPV5eQBwx">https://t.co/5BPV5eQBwx</a></p>&mdash; Max Gulhane MD (@MaxGulhaneMD) <a href="https://twitter.com/MaxGulhaneMD/status/1977900861167972365?ref_src=twsrc%5Etfw">October 14, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Danger on the Journey.<br>Mars astronauts may require kidney dialysis on return.<br>As a result of the study, it is stated that the human kidney will not be able to withstand Galactic Cosmic Radiation (GCR) and will fail during trips to Mars. 🚀<a href="https://twitter.com/hashtag/BreakingNews%E2%80%8C?src=hash&amp;ref_src=twsrc%5Etfw">#BreakingNews</a><a href="https://twitter.com/hashtag/nasa?src=hash&amp;ref_src=twsrc%5Etfw">#nasa</a> <a href="https://twitter.com/hashtag/Mars?src=hash&amp;ref_src=twsrc%5Etfw">#Mars</a> <a href="https://twitter.com/hashtag/space?src=hash&amp;ref_src=twsrc%5Etfw">#space</a> <a href="https://twitter.com/hashtag/life?src=hash&amp;ref_src=twsrc%5Etfw">#life</a> <a href="https://t.co/qkiDO3kjIa">pic.twitter.com/qkiDO3kjIa</a></p>&mdash; PxPx2025 (@PxPx2025) <a href="https://twitter.com/PxPx2025/status/1802288785851330683?ref_src=twsrc%5Etfw">June 16, 2024</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Gefahr auf der Reise.<br>Mars-Astronauten benötigen möglicherweise bei der Rückkehr eine Nierendialyse.<br>Als Ergebnis der Studie wird festgestellt, dass die menschliche Niere der Galaktischen Kosmischen Strahlung (GCR) nicht standhalten kann und bei Reisen zum Mars versagen wird. 🚀<a href="https://twitter.com/hashtag/BreakingNews%E2%80%8C?src=hash&amp;ref_src=twsrc%5Etfw">#Eilmeldung</a><a href="https://twitter.com/hashtag/nasa?src=hash&amp;ref_src=twsrc%5Etfw">#nasa</a> <a href="https://twitter.com/hashtag/Mars?src=hash&amp;ref_src=twsrc%5Etfw">#Mars</a> <a href="https://twitter.com/hashtag/space?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraum</a> <a href="https://twitter.com/hashtag/life?src=hash&amp;ref_src=twsrc%5Etfw">#Leben</a> <a href="https://t.co/qkiDO3kjIa">pic.twitter.com/qkiDO3kjIa</a></p>&mdash; PxPx2025 (@PxPx2025) <a href="https://twitter.com/PxPx2025/status/1802288785851330683?ref_src=twsrc%5Etfw">June 16, 2024</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Es wird eng im All. Immer mehr Trümmerteile alter Satelliten versperren den freien Flug ins Universum. Andererseits sind auf die stürzende Raumfahrttrümmer eine Gefahr.<br><br>Der letzte Schub, und Aeolus fällt vom Himmel<a href="https://twitter.com/hashtag/Satelliten?src=hash&amp;ref_src=twsrc%5Etfw">#Satelliten</a> <a href="https://twitter.com/hashtag/Weltraumschrott?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumschrott</a> <a href="https://twitter.com/hashtag/Weltraum?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraum</a> <a href="https://twitter.com/hashtag/M%C3%BCll?src=hash&amp;ref_src=twsrc%5Etfw">#Müll</a> <a href="https://t.co/xpGIrqXliw">pic.twitter.com/xpGIrqXliw</a></p>&mdash; Melanie (@Na_So_Nicht) <a href="https://twitter.com/Na_So_Nicht/status/1754776692042670337?ref_src=twsrc%5Etfw">February 6, 2024</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Im <a href="https://twitter.com/hashtag/Weltraum?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraum</a> herrscht reger Verkehr – und höchste Kollisionsgefahr. Jetzt soll ein internationaler Vertrag her. <a href="https://t.co/Hb5ynaWHTO">https://t.co/Hb5ynaWHTO</a></p>&mdash; SRF News (@srfnews) <a href="https://twitter.com/srfnews/status/1641719576583864322?ref_src=twsrc%5Etfw">March 31, 2023</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': null 
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">As the climate crisis deepens, we need to ask:<br><br>Who is space tourism really for?<br>And who’s paying the price?<br><br>This convo isn’t anti-science—it’s about accountability.<br><br>Let’s talk about the hidden costs of NS-31.<a href="https://twitter.com/hashtag/ClimateCrisis?src=hash&amp;ref_src=twsrc%5Etfw">#ClimateCrisis</a> <a href="https://twitter.com/hashtag/NS31?src=hash&amp;ref_src=twsrc%5Etfw">#NS31</a> <a href="https://twitter.com/hashtag/BlueOrigin?src=hash&amp;ref_src=twsrc%5Etfw">#BlueOrigin</a> <a href="https://twitter.com/hashtag/SpaceTourism?src=hash&amp;ref_src=twsrc%5Etfw">#SpaceTourism</a> <a href="https://twitter.com/hashtag/earthhero?src=hash&amp;ref_src=twsrc%5Etfw">#earthhero</a> <a href="https://t.co/d8yZZXyNPs">pic.twitter.com/d8yZZXyNPs</a></p>&mdash; Earth Hero (@EarthHeroOrg) <a href="https://twitter.com/EarthHeroOrg/status/1914317569579696361?ref_src=twsrc%5Etfw">April 21, 2025</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Während sich die Klimakrise verschärft, müssen wir fragen:<br><br>Für wen ist der Weltraumtourismus wirklich gedacht?<br>Und wer bezahlt den Preis?<br><br>Diese Diskussion ist nicht wissenschaftsfeindlich – es geht um Verantwortung.<br><br>Lasst uns über die versteckten Kosten von NS-31 sprechen.<a href="https://twitter.com/hashtag/ClimateCrisis?src=hash&amp;ref_src=twsrc%5Etfw">#Klimakrise</a> <a href="https://twitter.com/hashtag/NS31?src=hash&amp;ref_src=twsrc%5Etfw">#NS31</a> <a href="https://twitter.com/hashtag/BlueOrigin?src=hash&amp;ref_src=twsrc%5Etfw">#BlueOrigin</a> <a href="https://twitter.com/hashtag/SpaceTourism?src=hash&amp;ref_src=twsrc%5Etfw">#Weltraumtourismus</a> <a href="https://twitter.com/hashtag/earthhero?src=hash&amp;ref_src=twsrc%5Etfw">#Erdheld</a> <a href="https://t.co/d8yZZXyNPs">pic.twitter.com/d8yZZXyNPs</a></p>&mdash; Earth Hero (@EarthHeroOrg) <a href="https://twitter.com/EarthHeroOrg/status/1914317569579696361?ref_src=twsrc%5Etfw">April 21, 2025</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
    {
        'type': 'twitter',
        'html': '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First seat to space on Blue Origin&#39;s New Shepard sells for $28 million <a href="https://t.co/uVNS55Llyu">https://t.co/uVNS55Llyu</a> <a href="https://t.co/PQmSgcdyLr">pic.twitter.com/PQmSgcdyLr</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/1403774516938092546?ref_src=twsrc%5Etfw">June 12, 2021</a></div> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>',
        'translatedHtml': '<blockquote class="twitter-tweet"><p lang="de" dir="ltr">Der erste Sitz ins All auf Blue Origins New Shepard wird für 28 Millionen Dollar verkauft <a href="https://t.co/uVNS55Llyu">https://t.co/uVNS55Llyu</a> <a href="https://t.co/PQmSgcdyLr">pic.twitter.com/PQmSgcdyLr</a></p>&mdash; SPACE.com (@SPACEdotcom) <a href="https://twitter.com/SPACEdotcom/status/1403774516938092546?ref_src=twsrc%5Etfw">June 12, 2021</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'
    },
            ],
            zeitungsartikel: [
                    {
        'title': "Auf dem Weg zu neuen Weltraumorten und der Nutzung dortiger kommerzieller Möglichkeiten – Eine realistische Zukunftsvision oder eine Vision, die kaum je Realität werden kann?",
        'snippet': "Der Preis für einen derartigen Trip wird voraussichtlich für viele Jahre und gar Jahrzehnte noch sehr hoch bleiben, da der Aufwand des Fluges, die Ernährung und die notwendigen Vorbereitungen der Touristen, sich im gravitationslosen Umfeld zu bewegen, auf absehbare Zeit extrem hoch bleiben werden. Noch immer kostet jedes Kilogramm, das die Erdanziehung überwinden muss, mehrere zehntausend Euro! Zudem sind Raketenstarts in den Weltraum bis heute keine Routineoperation, nicht zu vergleichen mit einem Flugzeugstart. Bei jedem Start bestehen immer noch signifikante Risiken.",
        'link': "https://scilogs.spektrum.de/beobachtungen-der-wissenschaft/auf-dem-weg-zu-neuen-weltraumorten-und-der-nutzung-dortiger-kommerzieller-moeglichkeiten-eine-realistische-zukunftsvision-oder-eine-vision-die-kaum-je-realitaet-werden-kann/",
        'date': "04.08.2022",
        'readTime': "7 Minuten",
        'journal': "Spektrum.de SciLogs."
    },
    {
        'title': "Der Mythos des Weltraumtourismus: Fortschritt ohne Verantwortung",
        'snippet': "Weltraumtourismus wird oft als technischer Fortschritt gefeiert – doch  hinter der glanzvollen Fassade liegen tiefgreifende soziale, ökologische und ideologische Probleme. Am Beispiel von Blue Origin und prominenten Missionen wie NS-31 wird deutlich, wie Exklusivität und symbolpolitische Strategien systematische Ungleichheiten verschleiern.",
        'link': "https://www.alexandria-magazin.at/magazin/der-mythos-des-weltraumtourismus-fortschritt-ohne-verantwortung-.php",
        'date': "17.07.2025",
        'readTime': "5 Minuten",
        'journal': "Alexandria"
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
        'title': " Raketenabgase verpesten Erdatmosphäre",
        'snippet': "Die Verschmutzung durch Abgase von Raketen, die für die kommerzielle Raumfahrt genutzt werden, hat erhebliche Auswirkungen auf die Erdatmosphäre. Das zeigt eine neue Studie. Mit dem Boom des Weltraumtourismus müssen private Raumfahrtunternehmen auch die Folgen für das Klima vermehrt berücksichtigen, fordern die Forscher.",
        'link': "https://science.orf.at/stories/3213157/",
        'date': "18.05.2022",
        'readTime': "3 Minuten",
        'journal': "Science ORF.at"
    },
    {
        'title': "Den höchsten Preis bezahlt die Umwelt",
        'snippet': "7.000 Menschen boten mit, als Jeff Bezos vor seinem Weltraumflug einen Platz in seiner Raumkapsel versteigerte. Wird der 10-Minuten-Trip ins All der neue Trend unter Bestverdienern? Und wie teuer wird das für uns alle?",
        'link': "https://www.ardalpha.de/wissen/weltall/raumfahrt/weltraum-tourismus-raketen-co2-bilanz-umwelt-100.html",
        'date': "24.11.2022",
        'readTime': "4 Minuten",
        'journal': "ARD alpha"
    },

    {
        'title': "Darum kann ein Flug ins All furchtbar ungesund sein",
        'snippet': "Der menschliche Körper ist für das Weltall eigentlich nicht gemacht. Er braucht die Erdanziehung um normal zu funktionierten. In der Schwerelosigkeit verteilen sich zum Beispiel Körperflüssigkeiten ganz anders. […] Muskeln und Knochen bauen sich innerhalb kürzester Zeit ab, weil sie kaum gebraucht werden. Die Folge: Knochenabbau. […] Dein Risiko für Krebs steigt. Denn Astronaut:innen bekommen schon auf der internationalen Raumstation rund 300-mal mehr Strahlung ab als wir hier auf der Erde.",
        'link': "https://www.quarks.de/weltall/raumfahrt/flug-ins-weltall-ungesund/",
        'date': "21.07.2021",
        'readTime': "4 Minuten",
        'journal': "Quarks"
    },
    {
        'title': "Das Kessler-Syndrom: Warum die Raumfahrt spätestens für unsere Enkel ein Ende haben könnte",
        'snippet': "Die Verschmutzung der Erdumlaufbahn begann bereits 1957. Mittlerweile fliegen knapp 8.000 Tonnen im All. Die Trümmer gefährden jetzt schon künftige Weltraummissionen. Im All lebt es sich gefährlich. Satelliten oder die Internationale Raumstation ISS sind permanent von kosmischen Geschossen bedroht. Das können Mikrometeoriten sein oder eher noch Trümmerteile – so genannter Weltraummüll – die von irdischen Objekten stammen.",
        'link': "https://www.focus.de/wissen/weltraum/kessler-syndrom-zu-viel-weltraumschrott-die-raumfahrt-hat-spaetestens-fuer-unsere-enkel-ein-ende_id_9542215.html",
        'date': "22.03.2019",
        'readTime': "4 Minuten",
        'journal': "FOCUS onlince"
    },
    {
        'title': "Umweltauswirkungen der Raumfahrt",
        'snippet': "Satelliten bieten essentielle Dienste, haben aber problematische Umweltwirkungen, die bisher aufgrund der relative geringen Startdichte wenig beachtet wurden: Dazu gehören ozonschädigende Emissionen (Aluminium, Chlor) in der oberen Atmosphäre; enorme Treibstoffmengen mit Treibhausgasemissionen (CO2, Wassersdampf, Rußpartikel), auch bodennah beim Start; Weltraumschrott, mit Kollisionsgefahr und Emissionen beim Wiedereintritt; Gefährdung durch wiedereintretende Raketenteile/kaputte Satelliten; Beeinträchtigung der Astronomie.",
        'link': "https://www.parlament.gv.at/dokument/fachinfos/zukunftsthemen/145_umwelt-raumfahrt.PDF",
        'date': "01.11.2024",
        'readTime': "6 Minuten",
        'journal': "Monitoring von Zukunftsthemen für das österreichische Parlament"
    },
    {
        'title': "Katastrophen der bemannten Raumfahrt",
        'snippet': "Seit Beginn der bemannten Raumfahrt haben viele Astronauten ihr Leben riskiert. Oft kam es bei Starts und Landungen zu Katastrophen, die der Welt vor Augen führten, wie gefährlich Weltraummissionen sind.",
        'link': "https://www.planet-wissen.de/technik/weltraumforschung/astronaut/astronaut-katastrophen-100.html",
        'date': "04.06.2018",
        'readTime': "2 Minuten",
        'journal': "Planet Wissen"
    }

            ],


            chatbot: [] 
        },
    };


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
});