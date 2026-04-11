document.addEventListener('DOMContentLoaded', function() {
    console.log('Página cargada correctamente');

    // Highlight active nav link based on current page (desktop underline)
    (function highlightActiveNav() {
        // Extract the folder name from the URL path (e.g. /equipos/ → 'equipos', /noticias/article.html → 'noticias')
        var pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
        var currentFolder = pathParts[pathParts.length - 1] || '';
        // If we're on a specific article page inside noticias/, detect the parent folder
        if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'noticias' && currentFolder !== 'noticias') {
            currentFolder = 'noticias';
        }
        var clubPages = ['noticias', 'historia', 'organigrama', 'enprensa'];

        // Direct nav links (EQUIPOS, ABÓNATE, PATROCINADORES, CONTACTO)
        document.querySelectorAll('.nav > a').forEach(function(link) {
            var href = link.getAttribute('href');
            if (href) {
                var hrefParts = href.replace(/\/+$/, '').split('/');
                var linkFolder = hrefParts[hrefParts.length - 1] || '';
                if (linkFolder && linkFolder === currentFolder) {
                    link.classList.add('nav-active');
                }
            }
        });

        // If current page is under CLUB dropdown, highlight the CLUB toggle
        if (clubPages.indexOf(currentFolder) !== -1) {
            var dropdown = document.querySelector('.nav-dropdown');
            if (dropdown) {
                dropdown.classList.add('nav-active');
            }
        }
    })();

    // Loading screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        window.addEventListener('load', () => {
            loadingScreen.classList.add('fade-out');
            loadingScreen.addEventListener('transitionend', () => {
                loadingScreen.style.display = 'none';
            });
        });
    }
    
    // REGLA PERMANENTE: El borde superior de las imágenes del carrusel de equipos
    // debe quedar EXACTAMENTE en el límite inferior del viewport al cargar la página.
    // Esto debe funcionar en cualquier navegador y resolución desktop.
    //
    // Approach: The .above-fold div contains the news carousel + buttons.
    // We set its height so that the .carousel-container starts right at
    // window.innerHeight (below the sticky header + match banner).
    var _adjusting = false;
    function adjustCarouselPosition() {
        if (_adjusting) return;
        _adjusting = true;

        var aboveFold = document.querySelector('.above-fold');
        var carouselContainer = document.querySelector('.carousel-container');
        var header = document.querySelector('.header');
        var matchBanner = document.querySelector('.match-banner');

        if (!aboveFold || !carouselContainer) { _adjusting = false; return; }

        // Only apply the fixed-height constraint on desktop (>768px).
        // On mobile the rule doesn't apply — use natural flow.
        if (window.innerWidth <= 768) {
            aboveFold.style.height = 'auto';
            _adjusting = false;
            return;
        }

        // Reset to auto to measure natural content height
        aboveFold.style.height = 'auto';
        aboveFold.offsetHeight; // force reflow

        // Available space = viewport - header (sticky) - matchBanner - carousel-section padding-top
        var headerH = header ? header.offsetHeight : 0;
        var matchH = matchBanner ? matchBanner.offsetHeight : 0;
        var carouselSection = document.querySelector('.carousel-section');
        var csPadTop = carouselSection ? parseInt(getComputedStyle(carouselSection).paddingTop) || 0 : 0;
        var available = window.innerHeight - headerH - matchH - csPadTop;

        // ALWAYS set to exactly 'available' so the team carousel top sits at the viewport bottom.
        // The flex-shrink chain inside above-fold will compress the news image to fit.
        aboveFold.style.height = Math.max(0, available) + 'px';

        _adjusting = false;
    }

    // Debounced version for observers
    var _adjustTimer = null;
    function debouncedAdjust() {
        clearTimeout(_adjustTimer);
        _adjustTimer = setTimeout(adjustCarouselPosition, 50);
    }

    // Run immediately on DOMContentLoaded (now)
    adjustCarouselPosition();

    // Run again on full load (all images, fonts, iframes done)
    window.addEventListener('load', function() {
        adjustCarouselPosition();
        setTimeout(adjustCarouselPosition, 300);
        setTimeout(adjustCarouselPosition, 800);
        setTimeout(adjustCarouselPosition, 2000);
    });

    // Re-run on resize (debounced)
    window.addEventListener('resize', debouncedAdjust);

    // Re-run whenever any image finishes loading
    document.querySelectorAll('img').forEach(function(img) {
        if (!img.complete) {
            img.addEventListener('load', adjustCarouselPosition);
        }
    });
    
    // Carrusel infinito suave con JavaScript
    function setupInfiniteCarousel() {
        const track = document.querySelector('.carousel-track');
        const cards = document.querySelectorAll('.carousel-card');
        
        if (track && cards.length > 0) {
            // Calcular el ancho de una tarjeta + gap
            const cardWidth = 300; // ancho fijo de cada tarjeta
            const gap = 30; // gap entre tarjetas
            const cardTotalWidth = cardWidth + gap;
            
            // Número de tarjetas originales (mitad del total)
            const originalCardsCount = cards.length / 2;
            
            // Ancho total a desplazar para volver al inicio
            const resetPoint = originalCardsCount * cardTotalWidth;
            
            let currentTranslate = 0;
            const speed = 0.5; // píxeles por frame (ajustar para velocidad)
            
            function animate() {
                currentTranslate += speed;
                
                // Si llegamos al punto de reset, volver al inicio sin salto visible
                if (currentTranslate >= resetPoint) {
                    currentTranslate = 0;
                }
                
                track.style.transform = `translateX(-${currentTranslate}px)`;
                requestAnimationFrame(animate);
            }
            
            // Iniciar la animación
            animate();
            
            // Pausar al hacer hover
            track.addEventListener('mouseenter', () => {
                track.style.animationPlayState = 'paused';
            });
            
            track.addEventListener('mouseleave', () => {
                track.style.animationPlayState = 'running';
            });
        }
    }
    
    // Carrusel infinito de patrocinadores (sentido inverso)
    function setupSponsorsCarousel() {
        const track = document.querySelector('.sponsors-carousel-track');
        const cards = track ? track.querySelectorAll('.sponsor-link') : [];
        
        if (track && cards.length > 0) {
            const cardWidth = 220; // ancho fijo de cada tarjeta (matches CSS)
            const gap = 30; // gap entre tarjetas
            const cardTotalWidth = cardWidth + gap;
            
            const originalCardsCount = cards.length / 2;
            const resetPoint = originalCardsCount * cardTotalWidth;
            
            // Empezar desplazado (para moverse hacia la derecha)
            let currentTranslate = resetPoint;
            const speed = 0.5; // misma velocidad que el carrusel de equipos
            
            function animate() {
                currentTranslate -= speed; // sentido inverso (derecha a izquierda → izquierda a derecha)
                
                if (currentTranslate <= 0) {
                    currentTranslate = resetPoint;
                }
                
                track.style.transform = `translateX(-${currentTranslate}px)`;
                requestAnimationFrame(animate);
            }
            
            animate();
            
            track.addEventListener('mouseenter', () => {
                track.style.animationPlayState = 'paused';
            });
            
            track.addEventListener('mouseleave', () => {
                track.style.animationPlayState = 'running';
            });
        }
    }

    // Inject sponsors carousel on all pages except patrocinadores
    function injectSponsorsCarousel() {
        // Skip if already present or if on patrocinadores page
        if (document.querySelector('.sponsors-carousel-section')) return;
        var path = window.location.pathname.toLowerCase();
        if (path.indexOf('/patrocinadores') !== -1) return;

        // Determine asset base path
        var scriptTags = document.querySelectorAll('script[src*="script.js"]');
        var assetBase = 'src/assets/';
        if (scriptTags.length > 0) {
            var src = scriptTags[0].getAttribute('src');
            if (src && src.indexOf('../') === 0) {
                assetBase = '../src/assets/';
            }
        }

        var sponsors = [
            { href: 'https://www.autocenterprincipado.com/', img: 'autocenterprincipado.png', alt: 'Autocenter Principado' },
            { href: 'https://go-fit.es/centros/go-fit-oviedo/', img: 'gofit1.jpeg', alt: 'GoFit' },
            { href: 'https://www.cajaruraldeasturias.com/es', img: 'cajarural.jpg', alt: 'Caja Rural' },
            { href: 'https://seinte.es/', img: 'seinteenergia.png', alt: 'Seinte Energía' },
            { href: 'https://www.autocaresepifanio.com/', img: 'autocaresepifanio.webp', alt: 'Autocares Epifanio' },
            { href: 'https://legea.com/es', img: 'legea.svg', alt: 'Legea' },
            { href: 'https://cluber.es/', img: 'cluber.svg', alt: 'Cluber' },
            { href: 'https://www.dominospizza.es/es/', img: 'dominospizza.svg', alt: "Domino's Pizza" },
            { href: 'https://asadoselmaizal.com/', img: 'elmaizal.png', alt: 'El Maizal' },
            { href: 'https://elpichote.com/', img: 'elpichote.webp', alt: 'El Pichote' },
            { href: 'https://loscorzos.com/', img: 'loscorzoslogo.png', alt: 'Los Corzos' },
            { href: 'https://lasguelas.com/', img: 'sidrerialasguelas.png', alt: 'Sidrería Las Güelas' },
            { href: 'https://www.instagram.com/ovicentfisioterapia/', img: 'ovicent.jpg', alt: 'Ovicent Fisioterapia' },
            { href: 'https://braserialokal.com/', img: 'lokalcerveceria.jpg', alt: 'Lokal Cervecería' },
            { href: 'https://tabernazingara.es/', img: 'latabernazingara.png', alt: 'La Taberna Zíngara' },
            { href: 'https://elpiguena.com/', img: 'elpigueña.png', alt: 'El Pigüeña' },
            { href: 'https://www.administraciones-lorca.es/', img: 'administracioneslorca.png', alt: 'Administraciones Lorca' },
            { href: 'https://maps.app.goo.gl/gmJEMYNMoNBPEAov5', img: 'cafegernika.jpg', alt: 'Café Gernika' },
            { href: 'https://www.instagram.com/continentallugones/', img: 'cafecontinental.jpg', alt: 'Café Continental' }
        ];

        function buildLinks() {
            return sponsors.map(function(s) {
                return '<a href="' + s.href + '" target="_blank" rel="noopener noreferrer" class="sponsor-link sponsor-card">' +
                    '<img src="' + assetBase + s.img + '" alt="' + s.alt + '" class="sponsor-logo sponsor-logo-colaborador">' +
                '</a>';
            }).join('\n');
        }

        var linksHTML = buildLinks();
        var html = '<section class="sponsors-carousel-section">' +
            '<div class="sponsors-carousel-container">' +
                '<div class="sponsors-carousel-track">' +
                    linksHTML +
                    '<!-- Duplicado para efecto infinito -->' +
                    linksHTML +
                '</div>' +
            '</div>' +
        '</section>';

        var footer = document.querySelector('.footer');
        if (footer) {
            footer.insertAdjacentHTML('beforebegin', html);
        }
    }

    // Inject sponsors carousel on non-homepage pages, then start all carousels
    injectSponsorsCarousel();

    // Iniciar carruseles infinitos al cargar
    window.addEventListener('load', function() {
        setupInfiniteCarousel();
        setupSponsorsCarousel();
    });
    
    // Menú hamburguesa
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('.nav');
    
    if (hamburger && nav) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            nav.classList.toggle('active');
        });
        
        // Cerrar menú al hacer clic en un enlace (excepto dropdown toggles)
        const navLinks = document.querySelectorAll('.nav a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                nav.classList.remove('active');
            });
        });
    }

    // Dropdown "El Club" — toggle only on desktop (mobile is always expanded via CSS)
    const dropdownToggle = document.querySelector('.nav-dropdown-toggle');
    const navDropdown = document.querySelector('.nav-dropdown');
    
    if (dropdownToggle && navDropdown) {
        dropdownToggle.addEventListener('click', function(e) {
            if (window.innerWidth > 768) {
                e.preventDefault();
                e.stopPropagation();
                navDropdown.classList.toggle('active');
            }
        });

        // Cerrar dropdown al hacer clic fuera (solo desktop)
        document.addEventListener('click', function(e) {
            if (window.innerWidth > 768 && !navDropdown.contains(e.target)) {
                navDropdown.classList.remove('active');
            }
        });
    }
    
    // Carrusel táctil solo en móvil
    const carouselContainer = document.querySelector('.carousel-container');
    const carouselTrack = document.querySelector('.carousel-track');
    
    if (window.innerWidth <= 768 && carouselContainer && carouselTrack) {
        let isDown = false;
        let startX;
        let scrollLeft;
        let currentTransform = 0;
        
        // Habilitar scroll horizontal
        carouselContainer.style.overflowX = 'auto';
        carouselContainer.style.cursor = 'grab';
        
        // Detener la animación en móvil
        carouselTrack.style.animation = 'none';
        
        carouselContainer.addEventListener('mousedown', (e) => {
            isDown = true;
            carouselContainer.style.cursor = 'grabbing';
            startX = e.pageX - carouselContainer.offsetLeft;
            scrollLeft = carouselContainer.scrollLeft;
        });
        
        carouselContainer.addEventListener('mouseleave', () => {
            isDown = false;
            carouselContainer.style.cursor = 'grab';
        });
        
        carouselContainer.addEventListener('mouseup', () => {
            isDown = false;
            carouselContainer.style.cursor = 'grab';
        });
        
        carouselContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carouselContainer.offsetLeft;
            const walk = (x - startX) * 2;
            carouselContainer.scrollLeft = scrollLeft - walk;
        });
        
        // Touch events para móvil
        carouselContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].pageX - carouselContainer.offsetLeft;
            scrollLeft = carouselContainer.scrollLeft;
        });
        
        carouselContainer.addEventListener('touchmove', (e) => {
            const x = e.touches[0].pageX - carouselContainer.offsetLeft;
            const walk = (x - startX) * 2;
            carouselContainer.scrollLeft = scrollLeft - walk;
        });
    }

    // ── Data-driven components: Clasificación, Próximos, Goleadores ──
    (function loadLeagueData() {
        var TEAM_NAME = 'AUTO-CENTER PRINCIPADO';

        function normaliseName(name) {
            return (name || '').trim().toUpperCase();
        }

        /**
         * Format "SURNAME, NAME" → "N. Surname" for compact display
         */
        function formatPlayerName(raw) {
            var parts = raw.split(',');
            if (parts.length < 2) return raw;
            var surname = parts[0].trim();
            var firstName = parts[1].trim();
            // Capitalize properly
            function capitalize(s) {
                return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            }
            var surnameFormatted = surname.split(/\s+/).map(capitalize).join(' ');
            var initial = firstName.charAt(0).toUpperCase();
            return initial + '. ' + surnameFormatted;
        }

        /**
         * Format date string "2026-03-21 17:30:00" to Spanish display.
         */
        function formatDateSpanish(dateStr) {
            if (!dateStr || dateStr.trim() === '') return { date: 'Por definir', time: '' };
            var d = new Date(dateStr.replace(' ', 'T'));
            if (isNaN(d.getTime())) return { date: dateStr, time: '' };

            var days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

            var dayName = days[d.getDay()];
            var dayNum = d.getDate();
            var month = months[d.getMonth()];
            var hours = String(d.getHours()).padStart(2, '0');
            var mins = String(d.getMinutes()).padStart(2, '0');

            return {
                date: dayName + ' ' + dayNum + ' ' + month,
                time: hours + ':' + mins + 'h'
            };
        }

        // ── Standings ──
        function renderStandings(data) {
            var tbody = document.querySelector('#standings-table tbody');
            if (!tbody || !Array.isArray(data)) return;

            tbody.innerHTML = '';
            data.forEach(function(team) {
                var tr = document.createElement('tr');
                var isVetusta = normaliseName(team.nombre) === normaliseName(TEAM_NAME);
                if (isVetusta) tr.classList.add('st-highlight');

                // Color-coded DIF class
                var difClass = 'st-dif-zero';
                var difText = '0';
                if (team.DIF > 0) { difClass = 'st-dif-pos'; difText = '+' + team.DIF; }
                else if (team.DIF < 0) { difClass = 'st-dif-neg'; difText = '' + team.DIF; }

                tr.innerHTML =
                    '<td class="st-pos">' + team.posicion + '</td>' +
                    '<td><div class="st-team-cell">' +
                        (team.escudo ? '<img src="' + team.escudo + '" alt="" class="st-team-badge" loading="lazy">' : '') +
                        '<span class="st-team-name">' + (team.nombre || '') + '</span>' +
                    '</div></td>' +
                    '<td>' + team.PJ + '</td>' +
                    '<td>' + team.PG + '</td>' +
                    '<td>' + team.PE + '</td>' +
                    '<td>' + team.PP + '</td>' +
                    '<td class="st-hide-mobile">' + team.GF + '</td>' +
                    '<td class="st-hide-mobile">' + team.GC + '</td>' +
                    '<td class="' + difClass + '">' + difText + '</td>' +
                    '<td><strong>' + team.puntos + '</strong></td>';

                tbody.appendChild(tr);
            });
        }

        // ── Upcoming matches (max 3 for side panel) ──
        function renderProximos(data) {
            var container = document.getElementById('proximos-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay partidos próximos programados.</p>';
                return;
            }

            var maxItems = 3;
            data.slice(0, maxItems).forEach(function(match) {
                var dt = formatDateSpanish(match.fecha);
                var localidad = match.es_local ? 'Local' : 'Visitante';
                var localidadClass = match.es_local ? 'proximos-localidad-local' : 'proximos-localidad-away';
                var cardSideClass = match.es_local ? 'proximos-card-local' : 'proximos-card-away';

                var card = document.createElement('div');
                card.className = 'proximos-card ' + cardSideClass;

                var streamingHTML = '';
                if (match.url_streaming) {
                    streamingHTML =
                        '<div class="proximos-streaming">' +
                            '<a href="' + match.url_streaming + '" target="_blank" rel="noopener noreferrer" title="Ver en directo">' +
                                '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
                            '</a>' +
                        '</div>';
                }

                card.innerHTML =
                    '<div class="proximos-jornada">J<span>' + (match.jornada || '') + '</span></div>' +
                    '<img src="' + (match.escudo_rival || 'src/assets/escudo.png') + '" alt="" class="proximos-badge" loading="lazy">' +
                    '<div class="proximos-info">' +
                        '<div class="proximos-rival">' + (match.rival || 'Rival') + '</div>' +
                        '<div class="proximos-localidad ' + localidadClass + '">' + localidad + '</div>' +
                    '</div>' +
                    '<div class="proximos-datetime">' +
                        '<span class="proximos-date">' + dt.date + '</span>' +
                        (dt.time ? '<span class="proximos-time">' + dt.time + '</span>' : '') +
                    '</div>' +
                    streamingHTML;

                container.appendChild(card);
            });
        }

        // ── Recent results (max 3 for side panel) ──
        function renderResultados(data) {
            var container = document.getElementById('resultados-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay resultados disponibles.</p>';
                return;
            }

            data.forEach(function(match) {
                var localidad = match.es_local ? 'Local' : 'Visitante';
                var localidadClass = match.es_local ? 'proximos-localidad-local' : 'proximos-localidad-away';
                var cardSideClass = match.es_local ? 'proximos-card-local' : 'proximos-card-away';

                var resultClass = 'resultados-score-empate';
                if (match.resultado === 'V') resultClass = 'resultados-score-victoria';
                else if (match.resultado === 'D') resultClass = 'resultados-score-derrota';

                var scoreText = match.es_local
                    ? match.goles_vetusta + ' - ' + match.goles_rival
                    : match.goles_rival + ' - ' + match.goles_vetusta;

                var card = document.createElement('div');
                card.className = 'proximos-card ' + cardSideClass;

                card.innerHTML =
                    '<div class="proximos-jornada">J<span>' + (match.jornada || '') + '</span></div>' +
                    '<img src="' + (match.escudo_rival || 'src/assets/escudo.png') + '" alt="" class="proximos-badge" loading="lazy">' +
                    '<div class="proximos-info">' +
                        '<div class="proximos-rival">' + (match.rival || 'Rival') + '</div>' +
                        '<div class="proximos-localidad ' + localidadClass + '">' + localidad + '</div>' +
                    '</div>' +
                    '<div class="resultados-score ' + resultClass + '">' + scoreText + '</div>';

                container.appendChild(card);
            });
        }

        // ── Top scorers (max 10 for side panel) ──
        function renderGoleadores(data) {
            var container = document.getElementById('goleadores-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay datos de goleadores disponibles.</p>';
                return;
            }

            var maxItems = 5;
            // Default placeholder photo — generic user silhouette SVG as data URI
            var defaultPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 4v2h16v-2c0-1-2-4-8-4z"/></svg>');

            data.slice(0, maxItems).forEach(function(player, i) {
                var card = document.createElement('div');
                card.className = 'goleadores-card';

                var photoSrc = player.foto || defaultPhoto;

                card.innerHTML =
                    '<div class="goleadores-pos"><span>' + (i + 1) + '</span></div>' +
                    '<img src="' + photoSrc + '" alt="" class="goleadores-photo" loading="lazy">' +
                    '<div class="goleadores-info">' +
                        '<div class="goleadores-name">' + formatPlayerName(player.nombre) + '</div>' +
                        '<div class="goleadores-stats">' + player.partidos + ' partidos · ' + player.media + ' goles/partido</div>' +
                    '</div>' +
                    '<div class="goleadores-goals">' +
                        '<span class="goleadores-goals-count">' + player.goles + '</span>' +
                        '<span class="goleadores-goals-label">goles</span>' +
                    '</div>';

                container.appendChild(card);
            });
        }

        // Fetch all three JSON files (cache-busted)
        var basePath = './data/';
        var cacheBust = '?v=' + Date.now();
        Promise.all([
            fetch(basePath + 'clasificacion.json' + cacheBust).then(function(r) { return r.ok ? r.json() : []; }),
            fetch(basePath + 'calendario.json' + cacheBust).then(function(r) { return r.ok ? r.json() : []; }),
            fetch(basePath + 'resultados.json' + cacheBust).then(function(r) { return r.ok ? r.json() : []; }),
            fetch(basePath + 'goleadores.json' + cacheBust).then(function(r) { return r.ok ? r.json() : []; })
        ]).then(function(results) {
            renderStandings(results[0]);
            renderProximos(results[1]);
            renderResultados(results[2]);
            renderGoleadores(results[3]);
        }).catch(function(err) {
            console.warn('Failed to load league data:', err);
        });
    })();

    // News Carousel (Homepage)
    (function setupNewsCarousel() {
        const viewport = document.querySelector('.news-carousel-viewport');
        const slidesContainer = document.querySelector('.news-carousel-slides');
        const slides = document.querySelectorAll('.news-carousel-slide');
        const prevBtn = document.querySelector('.news-carousel-prev');
        const nextBtn = document.querySelector('.news-carousel-next');
        const dotsContainer = document.querySelector('.news-carousel-dots');

        if (!slidesContainer || slides.length === 0) return;

        let currentIndex = 0;
        const totalSlides = slides.length;
        const autoPlayInterval = window.innerWidth <= 768 ? 8000 : 10000;
        let autoPlayTimer;

        // Create dots
        slides.forEach(function(_, i) {
            const dot = document.createElement('button');
            dot.classList.add('news-carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.setAttribute('aria-label', 'Noticia ' + (i + 1));
            dot.addEventListener('click', function() {
                goToSlide(i);
                resetAutoPlay();
            });
            dotsContainer.appendChild(dot);
        });

        function goToSlide(index) {
            currentIndex = index;
            slidesContainer.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
            // Update dots
            var dots = dotsContainer.querySelectorAll('.news-carousel-dot');
            dots.forEach(function(d, i) {
                d.classList.toggle('active', i === currentIndex);
            });
        }

        function nextSlide() {
            goToSlide((currentIndex + 1) % totalSlides);
        }

        function prevSlide() {
            goToSlide((currentIndex - 1 + totalSlides) % totalSlides);
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                nextSlide();
                resetAutoPlay();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                prevSlide();
                resetAutoPlay();
            });
        }

        function startAutoPlay() {
            autoPlayTimer = setInterval(nextSlide, autoPlayInterval);
        }

        function resetAutoPlay() {
            clearInterval(autoPlayTimer);
            startAutoPlay();
        }

        // Start auto-play
        startAutoPlay();

        // Pause on hover
        if (viewport) {
            viewport.addEventListener('mouseenter', function() {
                clearInterval(autoPlayTimer);
            });
            viewport.addEventListener('mouseleave', function() {
                startAutoPlay();
            });
        }

        // Swipe support for mobile
        var touchStartX = 0;
        var touchEndX = 0;

        if (viewport) {
            viewport.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            viewport.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].screenX;
                var diff = touchStartX - touchEndX;
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        nextSlide();
                    } else {
                        prevSlide();
                    }
                    resetAutoPlay();
                }
            }, { passive: true });
        }
    })();

    // ── Next Match Banner: populate from proximo-partido.json ──
    (function loadNextMatchBanner() {
        var banner = document.getElementById('match-banner');
        var bannerLink = document.getElementById('match-banner-link');
        var btn = document.getElementById('header-streaming-btn');

        // Determine base path to data/ depending on page depth
        var scriptTags = document.querySelectorAll('script[src*="script.js"]');
        var basePath = './';
        if (scriptTags.length > 0) {
            var src = scriptTags[0].getAttribute('src');
            if (src && src.indexOf('../') === 0) {
                basePath = '../';
            }
        }

        // Only the homepage has the full banner; subpages only get streaming btn
        var isHomepage = !!banner;

        fetch(basePath + 'data/proximo-partido.json?v=' + Date.now())
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(match) {
                if (!match) {
                    // No upcoming match — hide the banner
                    if (banner) banner.style.display = 'none';
                    return;
                }

                // ── Populate banner (homepage only) ──
                if (isHomepage) {
                    var vetustaEscudo = 'src/assets/escudo.png';

                    // Home team
                    var homeBadge = document.getElementById('match-home-badge');
                    var homeNameFull = document.getElementById('match-home-name-full');
                    var homeNameShort = document.getElementById('match-home-name-short');
                    if (homeBadge) homeBadge.src = match.local.es_vetusta ? vetustaEscudo : (match.local.escudo || '');
                    if (homeNameFull) homeNameFull.textContent = match.local.nombre || '';
                    if (homeNameShort) homeNameShort.textContent = match.local.nombre_corto || '';

                    // Away team
                    var awayBadge = document.getElementById('match-away-badge');
                    var awayNameFull = document.getElementById('match-away-name-full');
                    var awayNameShort = document.getElementById('match-away-name-short');
                    if (awayBadge) awayBadge.src = match.visitante.es_vetusta ? vetustaEscudo : (match.visitante.escudo || '');
                    if (awayNameFull) awayNameFull.textContent = match.visitante.nombre || '';
                    if (awayNameShort) awayNameShort.textContent = match.visitante.nombre_corto || '';

                    // Center info
                    var venue = document.getElementById('match-venue');
                    var datetime = document.getElementById('match-datetime');
                    if (venue) venue.textContent = match.sede || '';
                    if (datetime) datetime.textContent = match.fecha_display || '';
                }

                // ── Streaming link (banner + header button) ──
                if (match.url_streaming) {
                    if (btn) {
                        btn.href = match.url_streaming;
                        btn.style.display = '';
                    }
                    if (bannerLink) {
                        bannerLink.href = match.url_streaming;
                    }
                } else {
                    // No streaming URL: make banner link non-clickable
                    if (bannerLink) {
                        bannerLink.removeAttribute('href');
                        bannerLink.style.cursor = 'default';
                    }
                }
            })
            .catch(function() { /* silently ignore */ });
    })();
});
