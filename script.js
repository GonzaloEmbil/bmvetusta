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

        // ── Upcoming matches (max 5 for side panel) ──
        function renderProximos(data) {
            var container = document.getElementById('proximos-list');
            if (!container || !Array.isArray(data)) return;

            container.innerHTML = '';

            if (data.length === 0) {
                container.innerHTML = '<p style="color:#555;text-align:center;padding:30px 20px;font-size:0.85rem;">No hay partidos próximos programados.</p>';
                return;
            }

            var maxItems = 5;
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

        // ── Top scorers (max 10 for side panel) ──
        function renderGoleadores(data) {
            var tbody = document.querySelector('#goleadores-table tbody');
            if (!tbody || !Array.isArray(data)) return;

            var maxItems = 10;
            var maxGoals = data.length > 0 ? data[0].goles : 1;
            tbody.innerHTML = '';
            data.slice(0, maxItems).forEach(function(player, i) {
                var barWidth = Math.round((player.goles / maxGoals) * 100);
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td class="gl-pos">' + (i + 1) + '</td>' +
                    '<td class="gl-name-cell">' + formatPlayerName(player.nombre) + '</td>' +
                    '<td class="gl-goals-cell">' + player.goles + '<div class="gl-goals-bar" style="width:' + barWidth + '%"></div></td>' +
                    '<td>' + player.partidos + '</td>' +
                    '<td>' + player.media + '</td>';
                tbody.appendChild(tr);
            });
        }

        // Fetch all three JSON files
        var basePath = './data/';
        Promise.all([
            fetch(basePath + 'clasificacion.json').then(function(r) { return r.ok ? r.json() : []; }),
            fetch(basePath + 'calendario.json').then(function(r) { return r.ok ? r.json() : []; }),
            fetch(basePath + 'goleadores.json').then(function(r) { return r.ok ? r.json() : []; })
        ]).then(function(results) {
            renderStandings(results[0]);
            renderProximos(results[1]);
            renderGoleadores(results[2]);
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
        const autoPlayInterval = 8000; // 8 seconds
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

    // ── Header Streaming Button: show if next match has url_streaming ──
    (function loadHeaderStreaming() {
        var btn = document.getElementById('header-streaming-btn');
        var bannerLink = document.getElementById('match-banner-link');
        if (!btn && !bannerLink) return;

        // Determine base path to data/ depending on page depth
        var scriptTags = document.querySelectorAll('script[src*="script.js"]');
        var basePath = './';
        if (scriptTags.length > 0) {
            var src = scriptTags[0].getAttribute('src');
            if (src && src.indexOf('../') === 0) {
                basePath = '../';
            }
        }

        fetch(basePath + 'data/calendario.json')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(data) {
                if (!Array.isArray(data) || data.length === 0) return;
                // Only show for the very next match (first in the sorted list)
                var nextMatch = data[0];
                if (nextMatch.url_streaming) {
                    if (btn) {
                        btn.href = nextMatch.url_streaming;
                        btn.style.display = '';
                    }
                    if (bannerLink) {
                        bannerLink.href = nextMatch.url_streaming;
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
