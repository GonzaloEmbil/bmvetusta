/* Alta de abonado/a online — Balonmano Vetusta 2026/2027
 * Envía al Worker propio del club. Si el envío falla, se ofrece el correo
 * como salida para que nadie se quede sin poder darse de alta.
 */
(function () {
    'use strict';

    var ENDPOINT = 'https://altas.balonmanovetusta.com/alta';
    var IBAN = 'ES13 3059 0062 8530 2750 7320';
    var DESTINO = 'sociosbalonmanovetusta@gmail.com';

    var form = document.getElementById('alta-form');
    if (!form) return;

    var incluidas = document.getElementById('alta-incluidas');
    var incluidasFilas = document.getElementById('alta-incluidas-filas');
    var incluidasHint = document.getElementById('alta-incluidas-hint');
    var tutor = document.getElementById('alta-tutor');
    var estado = document.getElementById('alta-estado');

    // ── Utilidades ──────────────────────────────────────────────────────────

    // DNI: 8 dígitos + letra. NIE: X/Y/Z + 7 dígitos + letra. La letra es un
    // dígito de control, así que valida erratas de verdad.
    function dniValido(v) {
        v = (v || '').toUpperCase().replace(/[\s-]/g, '');
        var m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(v);
        if (!m) return false;
        var num = (m[1] ? String('XYZ'.indexOf(m[1])) : '') + m[2];
        if (num.length !== 8) return false;
        return 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(parseInt(num, 10) % 23) === m[3];
    }

    function edad(iso) {
        if (!iso) return null;
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d)) return null;
        var hoy = new Date();
        var a = hoy.getFullYear() - d.getFullYear();
        var m = hoy.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) a--;
        return a;
    }

    function fechaOk(iso) { var e = edad(iso); return e !== null && e >= 0 && e < 120; }
    function telOk(v) { return /^[0-9]{9}$/.test((v || '').replace(/[\s()+-]/g, '').replace(/^34/, '')); }
    function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || ''); }
    function modSel() { return form.querySelector('input[name="modalidad"]:checked'); }
    function esc(s) { return (s || '').trim(); }

    // El concepto de la transferencia, tal como lo pide el club.
    function concepto(nombreCompleto, modalidad) {
        return (nombreCompleto || 'Tu nombre') + ' - Abono' + (modalidad ? ' ' + modalidad : '');
    }

    // ── Secciones que aparecen según la modalidad y la edad ─────────────────

    function filaIncluida(i, tipo) {
        var wrap = document.createElement('div');
        wrap.className = 'f-persona';
        wrap.innerHTML =
            '<p class="f-persona-tit">' + tipo + '</p>' +
            '<div class="f-grid">' +
            '  <label class="f-field f-wide"><span class="f-label">Nombre y apellidos</span>' +
            '    <input type="text" name="inc' + i + '_nombre"><span class="f-err" data-error-for="inc' + i + '_nombre"></span></label>' +
            '  <label class="f-field"><span class="f-label">DNI o NIE</span>' +
            '    <input type="text" name="inc' + i + '_dni" autocapitalize="characters" maxlength="9"><span class="f-err" data-error-for="inc' + i + '_dni"></span></label>' +
            '  <label class="f-field"><span class="f-label">Fecha de nacimiento</span>' +
            '    <input type="date" name="inc' + i + '_nacimiento"><span class="f-err" data-error-for="inc' + i + '_nacimiento"></span></label>' +
            '  <label class="f-field"><span class="f-label">Parentesco</span>' +
            '    <input type="text" name="inc' + i + '_parentesco" placeholder="Cónyuge, hijo/a…"><span class="f-err" data-error-for="inc' + i + '_parentesco"></span></label>' +
            '</div>';
        return wrap;
    }

    function pintarSecciones() {
        var m = modSel();
        var adultos = m ? parseInt(m.dataset.adultos, 10) : 0;
        var menores = m ? parseInt(m.dataset.menores, 10) : 0;
        var total = adultos + menores;

        if (!total) {
            incluidas.hidden = true;
            incluidasFilas.innerHTML = '';
        } else {
            incluidas.hidden = false;
            incluidasHint.textContent = menores
                ? 'El abono Familiar cubre a dos personas adultas y dos menores de 18 años de la misma unidad familiar. Indica los datos de las tres personas.'
                : 'Indica los datos de la otra persona adulta incluida en el abono.';
            // Se repinta sólo si cambia el número de filas, para no perder lo escrito
            if (incluidasFilas.children.length !== total) {
                incluidasFilas.innerHTML = '';
                for (var i = 1; i <= total; i++) {
                    incluidasFilas.appendChild(
                        filaIncluida(i, i <= adultos ? 'Persona adulta' : 'Menor de 18 años')
                    );
                }
            }
        }

        var e = edad(form.nacimiento.value);
        tutor.hidden = !(e !== null && e < 18);
        renumerar();
        actualizarPago();
    }

    // Los bloques ocultos no deben dejar huecos en la numeración.
    function renumerar() {
        var n = 0;
        form.querySelectorAll('.f-step').forEach(function (fs) {
            if (fs.hidden) return;
            var badge = fs.querySelector('.f-n');
            if (badge) badge.textContent = String(++n);
        });
    }

    function pagoSel() {
        return form.querySelector('input[name="pago"]:checked');
    }

    function actualizarPago() {
        var m = modSel();
        var importe = m ? m.dataset.precio + ' €' : '—';
        document.getElementById('alta-importe').textContent = importe;
        document.getElementById('alta-importe-pres').textContent = importe;
        var nom = esc(form.nombre.value);
        document.getElementById('alta-concepto').textContent = concepto(nom, m ? m.value : '');
        document.getElementById('alta-iban').textContent = IBAN;

        // Los datos de la cuenta están siempre visibles dentro de su recuadro;
        // sólo el aviso del pago presencial aparece y desaparece.
        var p = pagoSel();
        document.getElementById('alta-pago-presencial').hidden = !(p && p.value === 'Presencial');
    }

    // ── Validación ──────────────────────────────────────────────────────────

    function pintarError(campo, msg) {
        var slot = form.querySelector('[data-error-for="' + campo + '"]');
        if (slot) slot.textContent = msg || '';
        var el = form.elements[campo];
        if (el && el.classList) el.classList.toggle('f-bad', !!msg);
    }

    function validar() {
        var errores = [];
        function fallo(campo, msg) { pintarError(campo, msg); errores.push(campo); }

        form.querySelectorAll('.f-err').forEach(function (s) { s.textContent = ''; });
        form.querySelectorAll('.f-bad').forEach(function (s) { s.classList.remove('f-bad'); });

        if (!modSel()) fallo('modalidad', 'Elige una modalidad.');

        // Un solo campo para nombre y apellidos: se exige algo más que una
        // palabra, porque el club necesita el nombre completo para el carné.
        var nomCompleto = esc(form.nombre.value);
        if (!nomCompleto) {
            fallo('nombre', 'Escribe tu nombre y apellidos.');
        } else if (nomCompleto.split(/\s+/).length < 2) {
            fallo('nombre', 'Escribe también los apellidos.');
        }
        if (!dniValido(form.dni.value)) fallo('dni', 'Revisa el DNI o NIE: la letra no cuadra.');
        if (!fechaOk(form.nacimiento.value)) fallo('nacimiento', 'Indica tu fecha de nacimiento.');
        if (!telOk(form.telefono.value)) fallo('telefono', 'Un móvil de 9 cifras.');
        if (!emailOk(form.email.value)) fallo('email', 'Revisa el correo electrónico.');
        if (!esc(form.localidad.value)) fallo('localidad', 'Indica tu localidad.');

        // Coherencia entre modalidad y edad
        var e = edad(form.nacimiento.value);
        var m = modSel();
        if (m && e !== null) {
            if (m.value === 'Sub 18' && e >= 18) {
                fallo('modalidad', 'La modalidad Sub 18 es para menores de 18 años. Elige Adulto.');
            }
            if (m.value === 'Adulto' && e < 18) {
                fallo('modalidad', 'Tienes menos de 18 años: te corresponde la modalidad Sub 18.');
            }
        }

        // Personas incluidas: todas obligatorias, adultos y menores.
        if (!incluidas.hidden) {
            var filas = incluidasFilas.children.length;
            for (var i = 1; i <= filas; i++) {
                ['nombre', 'dni', 'nacimiento', 'parentesco'].forEach(function (k) {
                    var el = form.elements['inc' + i + '_' + k];
                    if (el && !esc(el.value)) fallo('inc' + i + '_' + k, 'Campo obligatorio.');
                });
                var d = form.elements['inc' + i + '_dni'];
                if (d && esc(d.value) && !dniValido(d.value)) fallo(d.name, 'Revisa el DNI o NIE.');
                // Un Sub 18 del abono Familiar tiene que ser menor de verdad.
                var f = form.elements['inc' + i + '_nacimiento'];
                var esMenorEsperado = m && i > parseInt(m.dataset.adultos, 10);
                if (f && esc(f.value) && esMenorEsperado) {
                    var ei = edad(f.value);
                    if (ei !== null && ei >= 18) fallo(f.name, 'Esta plaza es para menores de 18 años.');
                }
            }
        }

        if (!tutor.hidden) {
            if (!esc(form.tutor_nombre.value)) fallo('tutor_nombre', 'Campo obligatorio.');
            if (!dniValido(form.tutor_dni.value)) fallo('tutor_dni', 'Revisa el DNI o NIE.');
            if (!telOk(form.tutor_telefono.value)) fallo('tutor_telefono', 'Un móvil de 9 cifras.');
        }

        if (!pagoSel()) fallo('pago', 'Elige cómo quieres pagar.');
        if (!form.querySelector('input[name="imagen"]:checked')) fallo('imagen', 'Marca Sí o No.');
        if (!form.querySelector('input[name="comunicaciones"]:checked')) fallo('comunicaciones', 'Marca Sí o No.');
        if (!form.conformidad.checked) fallo('conformidad', 'Necesitamos tu conformidad para tramitar el alta.');

        return errores;
    }

    // ── Envío ───────────────────────────────────────────────────────────────

    function recoger() {
        var m = modSel();
        var d = {
            modalidad: m ? m.value : '',
            pago: (pagoSel() || {}).value || '',
            importe: m ? m.dataset.precio + ' €' : '',
            nombre: esc(form.nombre.value),
            apellidos: '',            // el formulario recoge el nombre completo en un campo
            dni: esc(form.dni.value).toUpperCase(),
            nacimiento: form.nacimiento.value,
            telefono: esc(form.telefono.value),
            email: esc(form.email.value),
            localidad: esc(form.localidad.value),
            imagen: (form.querySelector('input[name="imagen"]:checked') || {}).value || '',
            comunicaciones: (form.querySelector('input[name="comunicaciones"]:checked') || {}).value || '',
            web: form.web ? form.web.value : '',   // trampa antispam: debe ir vacío
            incluidas: [],
            tutor: null,
            enviado: new Date().toISOString()
        };
        for (var i = 1; i <= incluidasFilas.children.length; i++) {
            var n = form.elements['inc' + i + '_nombre'];
            if (n && esc(n.value)) {
                d.incluidas.push({
                    nombre: esc(n.value),
                    dni: esc(form.elements['inc' + i + '_dni'].value).toUpperCase(),
                    nacimiento: form.elements['inc' + i + '_nacimiento'].value,
                    parentesco: esc(form.elements['inc' + i + '_parentesco'].value)
                });
            }
        }
        if (!tutor.hidden) {
            d.tutor = {
                nombre: esc(form.tutor_nombre.value),
                dni: esc(form.tutor_dni.value).toUpperCase(),
                telefono: esc(form.tutor_telefono.value)
            };
        }
        return d;
    }

    function comoTexto(d) {
        var L = ['ALTA DE ABONADO/A · TEMPORADA 2026/2027', '',
            'Modalidad: ' + d.modalidad + ' (' + d.importe + ')',
            'Forma de pago: ' + d.pago, '',
            'TITULAR',
            'Nombre: ' + d.nombre,
            'DNI/NIE: ' + d.dni,
            'Nacimiento: ' + d.nacimiento,
            'Móvil: ' + d.telefono,
            'Correo: ' + d.email,
            'Localidad: ' + d.localidad];
        if (d.incluidas.length) {
            L.push('', 'PERSONAS INCLUIDAS');
            d.incluidas.forEach(function (p) {
                L.push('- ' + p.nombre + ' | ' + p.dni + ' | ' + p.nacimiento + ' | ' + p.parentesco);
            });
        }
        if (d.tutor) {
            L.push('', 'TUTOR/A LEGAL', d.tutor.nombre + ' | ' + d.tutor.dni + ' | ' + d.tutor.telefono);
        }
        L.push('', 'CONSENTIMIENTOS',
            'Derechos de imagen: ' + d.imagen,
            'Comunicaciones: ' + d.comunicaciones,
            '', 'Conformidad aceptada. Enviado: ' + d.enviado);
        return L.join('\n');
    }

    function mostrarOk(d, numero, socios) {
        var wrap = document.getElementById('alta-ok-numero-wrap');
        if (wrap) {
            // Cada persona del abono es un socio con su número: si hay varios
            // se listan todos, porque cada uno necesita el suyo.
            if (socios && socios.length > 1) {
                wrap.innerHTML = 'Números de abonado/a:<br>' + socios.map(function (s) {
                    return '<strong>' + s.numero + '</strong> · ' + s.nombre;
                }).join('<br>');
            } else {
                wrap.innerHTML = 'Tu número de abonado/a es el <strong>' + (numero || '') + '</strong>';
            }
            wrap.hidden = !numero;
        }
        document.getElementById('alta-ok-email').textContent = d.email;
        var intro = document.getElementById('alta-ok-intro');
        if (d.pago === 'Presencial') {
            intro.innerHTML = 'Hemos recibido tus datos. Puedes pagar los <strong>' + d.importe +
                '</strong> en el Florida Arena cualquier día que el Balonmano Vetusta juegue como local.';
            document.getElementById('alta-ok-pago').innerHTML = '';
            document.getElementById('alta-ok-pago').hidden = true;
        } else {
            intro.innerHTML = 'Hemos recibido tus datos. El último paso es la <strong>transferencia</strong>:';
            document.getElementById('alta-ok-pago').hidden = false;
            document.getElementById('alta-ok-pago').innerHTML =
                '<div class="f-pago-fila"><span class="f-pago-k">Importe</span><span class="f-pago-v">' + d.importe + '</span></div>' +
                '<div class="f-pago-fila"><span class="f-pago-k">Destinatario</span><span class="f-pago-v">Club Balonmano Vetusta</span></div>' +
                '<div class="f-pago-fila"><span class="f-pago-k">IBAN</span><span class="f-pago-v f-iban">' + IBAN + '</span></div>' +
                '<div class="f-pago-fila"><span class="f-pago-k">Concepto</span><span class="f-pago-v">' +
                    concepto(d.nombre, d.modalidad) + '</span></div>';
        }
        form.hidden = true;
        document.getElementById('alta-ok').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function salidaPorCorreo(d) {
        estado.innerHTML = 'No hemos podido enviarlo. ' +
            '<a href="#" id="alta-por-correo">Envíanoslo por correo</a> o inténtalo más tarde.';
        var enlace = document.getElementById('alta-por-correo');
        if (!enlace) return;
        enlace.addEventListener('click', function (ev) {
            ev.preventDefault();
            window.location.href = 'mailto:' + DESTINO +
                '?subject=' + encodeURIComponent('Alta de abonado/a 26/27 · ' + d.nombre) +
                '&body=' + encodeURIComponent(comoTexto(d));
        });
    }

    /**
     * Qué pasos han quedado incompletos. Se deduce de los avisos ya pintados
     * en cada bloque, en vez de mantener una lista de campos por paso: así no
     * hay dos sitios que puedan desincronizarse al añadir un campo.
     */
    function pasosIncompletos() {
        var faltan = [];
        form.querySelectorAll('.f-step').forEach(function (fs) {
            if (fs.hidden) return;
            var hayError = [].some.call(fs.querySelectorAll('.f-err'), function (e) {
                return e.textContent.trim();
            });
            if (!hayError) return;
            var leg = fs.querySelector('legend');
            var num = leg ? leg.querySelector('.f-n') : null;
            var titulo = leg ? leg.textContent.trim() : '';
            if (num) titulo = titulo.slice(num.textContent.length).trim();
            faltan.push({ n: num ? num.textContent : '', titulo: titulo, el: fs });
        });
        return faltan;
    }

    function mostrarResumen(faltan) {
        var caja = document.getElementById('alta-resumen');
        if (!caja) return;
        if (!faltan.length) {
            caja.hidden = true;
            caja.innerHTML = '';
            return;
        }
        caja.hidden = false;
        caja.innerHTML =
            '<p class="f-resumen-tit">No podemos enviar el formulario: ' +
            (faltan.length === 1 ? 'falta un paso por completar' : 'faltan ' + faltan.length + ' pasos por completar') +
            '</p><ul class="f-resumen-lista">' +
            faltan.map(function (f, i) {
                return '<li><button type="button" data-ir="' + i + '">Paso ' + f.n + ': ' + f.titulo + '</button></li>';
            }).join('') +
            '</ul>';
        caja.querySelectorAll('[data-ir]').forEach(function (b) {
            b.addEventListener('click', function () {
                var f = faltan[parseInt(b.dataset.ir, 10)];
                f.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                var primero = f.el.querySelector('.f-bad') ||
                    f.el.querySelector('input:not([type="hidden"])');
                if (primero) setTimeout(function () { primero.focus({ preventScroll: true }); }, 400);
            });
        });
    }

    form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var errores = validar();
        if (errores.length) {
            estado.textContent = '';
            var faltan = pasosIncompletos();
            mostrarResumen(faltan);
            // Se lleva la vista al resumen, que está junto al botón que se ha
            // pulsado, y desde ahí se salta a cada paso.
            document.getElementById('alta-resumen').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        estado.textContent = '';
        mostrarResumen([]);
        var d = recoger();
        var btn = form.querySelector('.f-submit');
        btn.disabled = true;
        estado.textContent = 'Enviando…';

        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d)
        }).then(function (r) {
            return r.json().catch(function () { return {}; })
                .then(function (j) { return { status: r.status, body: j }; });
        }).then(function (res) {
            if (res.status === 200 && res.body.ok) { mostrarOk(d, res.body.numero, res.body.socios); return; }
            btn.disabled = false;
            if (res.status === 409) {
                var repes = (res.body.dnis || []).join(', ');
                estado.innerHTML = (repes ? 'Ya hay un alta con este DNI: ' + repes + '. ' : 'Ese DNI ya está dado de alta esta temporada. ') +
                    'Si crees que es un error, escríbenos a <a href="mailto:' + DESTINO + '">' + DESTINO + '</a>';
                return;
            }
            if (res.status === 422) {
                estado.textContent = 'Hay algún dato que no cuadra. Revísalo e inténtalo de nuevo.';
                return;
            }
            if (res.status === 429) {
                estado.textContent = 'Demasiados envíos desde esta conexión. Prueba dentro de un rato.';
                return;
            }
            throw new Error('HTTP ' + res.status);
        }).catch(function () {
            btn.disabled = false;
            salidaPorCorreo(d);
        });
    });

    // Repintado en vivo
    form.querySelectorAll('input[name="modalidad"]').forEach(function (r) {
        r.addEventListener('change', pintarSecciones);
    });
    form.nacimiento.addEventListener('change', pintarSecciones);
    form.querySelectorAll('input[name="pago"]').forEach(function (r) {
        r.addEventListener('change', actualizarPago);
    });
    form.nombre.addEventListener('input', actualizarPago);
    form.dni.addEventListener('blur', function () {
        if (esc(form.dni.value)) {
            pintarError('dni', dniValido(form.dni.value) ? '' : 'Revisa el DNI o NIE: la letra no cuadra.');
        }
    });

    pintarSecciones();
})();
