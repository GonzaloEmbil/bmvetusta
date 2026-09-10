/* Alta de abonado/a online — Balonmano Vetusta 2026/2027
 * Envía al Worker propio del club. Si el envío falla, se ofrece el correo
 * como salida para que nadie se quede sin poder darse de alta.
 */
(function () {
    'use strict';

    var ENDPOINT = 'https://altas.balonmanovetusta.com/alta';
    var IBAN = 'ES13 3059 0062 8530 2750 7320';
    var DESTINO = 'balonmanovetusta@gmail.com';

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

    function actualizarPago() {
        var m = modSel();
        document.getElementById('alta-importe').textContent = m ? m.dataset.precio + ' €' : '—';
        var nom = (esc(form.nombre.value) + ' ' + esc(form.apellidos.value)).trim();
        document.getElementById('alta-concepto').textContent = concepto(nom, m ? m.value : '');
        document.getElementById('alta-iban').textContent = IBAN;
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

        if (!esc(form.nombre.value)) fallo('nombre', 'Escribe tu nombre.');
        if (!esc(form.apellidos.value)) fallo('apellidos', 'Escribe tus apellidos.');
        if (!dniValido(form.dni.value)) fallo('dni', 'Revisa el DNI o NIE: la letra no cuadra.');
        if (!fechaOk(form.nacimiento.value)) fallo('nacimiento', 'Indica tu fecha de nacimiento.');
        if (!telOk(form.telefono.value)) fallo('telefono', 'Un móvil de 9 cifras.');
        if (!emailOk(form.email.value)) fallo('email', 'Revisa el correo electrónico.');
        if (!esc(form.localidad.value)) fallo('localidad', 'Indica tu localidad.');
        if (!esc(form.provincia.value)) fallo('provincia', 'Indica tu provincia.');

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
            importe: m ? m.dataset.precio + ' €' : '',
            nombre: esc(form.nombre.value),
            apellidos: esc(form.apellidos.value),
            dni: esc(form.dni.value).toUpperCase(),
            nacimiento: form.nacimiento.value,
            telefono: esc(form.telefono.value),
            email: esc(form.email.value),
            localidad: esc(form.localidad.value),
            provincia: esc(form.provincia.value),
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
            'Modalidad: ' + d.modalidad + ' (' + d.importe + ')', '',
            'TITULAR',
            'Nombre: ' + d.nombre + ' ' + d.apellidos,
            'DNI/NIE: ' + d.dni,
            'Nacimiento: ' + d.nacimiento,
            'Móvil: ' + d.telefono,
            'Correo: ' + d.email,
            'Localidad: ' + d.localidad + ' (' + d.provincia + ')'];
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

    function mostrarOk(d, numero) {
        var wrap = document.getElementById('alta-ok-numero-wrap');
        if (wrap) {
            document.getElementById('alta-ok-numero').textContent = numero || '';
            wrap.hidden = !numero;
        }
        document.getElementById('alta-ok-email').textContent = d.email;
        document.getElementById('alta-ok-pago').innerHTML =
            '<div class="f-pago-fila"><span class="f-pago-k">Importe</span><span class="f-pago-v">' + d.importe + '</span></div>' +
            '<div class="f-pago-fila"><span class="f-pago-k">Destinatario</span><span class="f-pago-v">Club Balonmano Vetusta</span></div>' +
            '<div class="f-pago-fila"><span class="f-pago-k">IBAN</span><span class="f-pago-v f-iban">' + IBAN + '</span></div>' +
            '<div class="f-pago-fila"><span class="f-pago-k">Concepto</span><span class="f-pago-v">' +
                concepto(d.nombre + ' ' + d.apellidos, d.modalidad) + '</span></div>';
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
                '?subject=' + encodeURIComponent('Alta de abonado/a 26/27 · ' + d.nombre + ' ' + d.apellidos) +
                '&body=' + encodeURIComponent(comoTexto(d));
        });
    }

    form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var errores = validar();
        if (errores.length) {
            estado.textContent = 'Revisa los campos marcados en rojo.';
            var primero = form.querySelector('.f-bad') ||
                form.querySelector('[data-error-for="' + errores[0] + '"]');
            if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        estado.textContent = '';
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
            if (res.status === 200 && res.body.ok) { mostrarOk(d, res.body.numero); return; }
            btn.disabled = false;
            if (res.status === 409) {
                estado.innerHTML = 'Ese DNI ya está dado de alta esta temporada. ' +
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
    ['nombre', 'apellidos'].forEach(function (k) {
        form[k].addEventListener('input', actualizarPago);
    });
    form.dni.addEventListener('blur', function () {
        if (esc(form.dni.value)) {
            pintarError('dni', dniValido(form.dni.value) ? '' : 'Revisa el DNI o NIE: la letra no cuadra.');
        }
    });

    pintarSecciones();
})();
