// FINE HTML

// Variables globales

let rooms = {};
let currentRoom = null;
let contextMenuRoom = null;
let resolvedIncidents = [];
let managementNotifications = [];



let __incidentsChannel;

function setupSupabaseSubscription() {
  if (!supabaseClient || __incidentsChannel) return;

  __incidentsChannel = supabaseClient
    .channel('incidencias-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, (payload) => {
      // Cada cambio en la tabla refresca la vista
      cargarIncidenciasSupabase();
    })
    .subscribe((status) => console.log('Realtime:', status));
}

let __guestsChannel;

function setupHuespedesSubscription() {
    console.log('Intentando configurar suscripción de huéspedes...', !!supabaseClient, !!__guestsChannel);
    if (!supabaseClient || __guestsChannel) return;
    
    __guestsChannel = supabaseClient
  .channel('huespedes-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'huespedes' }, (payload) => {
      console.log('CALLBACK EJECUTADO - Cambio en huéspedes:', payload);
      cargarHuespedesSupabase().then(() => {
          // Forzar actualización de estados después de cargar huéspedes
          Object.keys(rooms).forEach(roomNum => {
              updateRoomStatus(roomNum);
          });
      });
  })
  .subscribe((status) => console.log('Huéspedes Realtime:', status));}

// Utilidades de fecha
function formatDateKeyLocal(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // YYYY-MM-DD
}

function getDateInDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

// Iconos para tipos de incidencia (actualizados)
const typeIcons = {
    electrico: '⚡',
    fontaneria: '💧',
    limpieza: '🧽',
    climatizacion: '❄️',
    otro: '🔧'
};

// Tags frecuentes por categoría (ampliados y mejorados)
const frequentTags = {
    electrico: ['televisión', 'aire acondicionado', 'luces', 'enchufes', 'secador pelo'],
    fontaneria: ['ducha presión', 'agua caliente', 'goteo grifo', 'inodoro', 'desagüe lento'],
    limpieza: ['cambio sábanas', 'toallas sucias', 'baño limpieza', 'aspirar habitación', 'reposición amenities'],
    climatizacion: ['temperatura alta', 'ruido aire', 'mando roto', 'no enfría', 'filtro sucio'],
    otro: ['cerradura tarjeta', 'wifi lento', 'ruidos exterior', 'televisión canales', 'minibar vacío']
};

const commonTags = {
    electrico: [
        'bombilla fundida', 'lámpara mesilla', 'interruptor roto', 'enchufe suelto', 'cortocircuito',
        'televisión no funciona', 'canal premium', 'mando tv roto', 'pantalla rayada', 'audio bajo',
        'secador pelo averiado', 'plancha ropa', 'cafetera descalcificar', 'minibar no enfría', 'frigorífico ruido',
        'caja fuerte error', 'tarjeta magnética', 'cerradura electrónica', 'luz baño', 'cable usb',
        'toma corriente', 'fusible saltado', 'instalación eléctrica', 'led habitación', 'transformador'
    ],
    fontaneria: [
        'grifo gotea', 'ducha baja presión', 'inodoro atascado', 'cisterna no carga', 'desagüe obstruido',
        'agua caliente tarda', 'agua fría solo', 'presión agua baja', 'goteo continuo',
        'lavabo atascado', 'bidé roto', 'sifón tapado', 'tubería ruidosa', 'desatascar baño', 'monomando suelto',
        'grifería antigua', 'alcachofa ducha', 'mampara cristal', 'silicona ennegrecida', 'humedad pared'
    ],
    limpieza: [
        'sábanas manchadas', 'toallas húmedas', 'almohadas sucias', 'manta pelo', 'edredón cambiar',
        'aspirar alfombra', 'barrer terraza', 'fregar suelo', 'limpiar cristales', 'espejos manchados',
        'baño profundo', 'alfombra manchada', 'moqueta húmeda', 'cortinas polvo', 'persiana sucia',
        'papelera llena', 'cenicero sucio', 'gel ducha vacío', 'champú acabado', 'jabón manos',
        'papel higiénico', 'toallitas faciales', 'desinfectar baño', 'ambientador habitación',
        'cama desecha', 'polvo muebles', 'mancha colchón', 'suelo pegajoso', 'cambio ropa cama',
        'limpieza profunda', 'desinfección covid', 'aspirar colchón', 'limpiar armario'
    ],
    climatizacion: [
        'aire no funciona', 'calefacción fría', 'ventilador roto', 'temperatura incorrecta',
        'filtro muy sucio', 'mando aire perdido', 'ruido motor', 'no enfría suficiente', 'no calienta nada',
        'ventilación insuficiente', 'humedad alta', 'condensación ventana', 'corriente aire', 'termostato averiado',
        'split goteando', 'compresor ruidoso', 'gas refrigerante', 'conducto obstruido', 'rejilla sucia'
    ],
    otro: [
        'puerta no cierra', 'ventana atascada', 'balcón cerradura', 'llave partida', 'ruido aire acondicionado',
        'wifi muy lento', 'internet cortado', 'teléfono mudo', 'alarma incendios', 'detector humos pita',
        'muebles rotos', 'silla coja', 'mesa rayada', 'armario puerta', 'cama hundida',
        'colchón blando', 'somier ruidoso', 'pintura desconchada', 'pared húmeda', 'techo manchado', 'suelo levantado',
        'mantenimiento general', 'revisión anual', 'olores desagüe', 'insectos baño', 'roedores habitación',
        'goteras techo', 'ventana filtraciones', 'aislamiento térmico', 'insonorización', 'iluminación insuficiente'
    ]
};

// Sistema filtrado pulsantes indicativos
function filterByAll() {
    document.getElementById('filterStatus').value = '';
    renderRooms();
    showAlert('Mostrando todas las habitaciones', 'info', 2000, true);
}

function filterByStatus(status) {
    document.getElementById('filterStatus').value = status;
    renderRooms();
    showAlert(`Filtrado por: ${status}`, 'info', 2000, true);
}

function filterByIncidents(counterId) {
    document.getElementById('searchRoom').value = '';
    document.getElementById('filterStatus').value = '';
    const roomsWithIncidents = Object.values(rooms).filter(room => room.incidents.length > 0);
    renderFilteredRooms(roomsWithIncidents);
    if (counterId) {
        document.getElementById(counterId).textContent = roomsWithIncidents.length;
    }
    showAlert(`Mostrando habitaciones con incidencias`, 'info', 2000, true);
}

function filterByAlerts(counterId) {
    const roomsWithAlerts = Object.values(rooms).filter(room =>
        room.incidents.some(incident => incident.alertDate && incident.alertTime)
    );
    renderFilteredRooms(roomsWithAlerts);
    if (counterId) {
        document.getElementById(counterId).textContent = roomsWithAlerts.length;
    }
    showAlert('Mostrando habitaciones con alertas activas', 'info', 2000, true);
}

function filterByExpired(counterId) {
    const today = new Date().toISOString().split('T')[0];
    const expiredRooms = Object.values(rooms).filter(room =>
        room.incidents.some(incident => incident.expiry && incident.expiry < today)
    );
    renderFilteredRooms(expiredRooms);
    if (counterId) {
        document.getElementById(counterId).textContent = expiredRooms.length;
    }
    showAlert('Mostrando habitaciones con incidencias caducadas', 'info', 2000, true);
}

// Sistema de alertas mejorado - solo se muestran cuando se solicitan
function showAlert(message, type = 'info', duration = 5000, force = false) {
    if (!force && type !== 'success' && type !== 'error') {
        return;
    }
    const alertsContainer = document.getElementById('alertsContainer');
    if (!alertsContainer) return;
    const alertDiv = document.createElement('div');
    const alertId = Date.now() + Math.random();
    alertDiv.className = `alert-popup ${type}`;
    alertDiv.setAttribute('data-alert-id', alertId);
    alertDiv.innerHTML = `
               <div class="alert-popup-header">
                   ${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'} ${type.toUpperCase()}
                   <button class="alert-popup-close" onclick="removeAlert('${alertId}')">&times;</button>
               </div>
               <div>${message}</div>
           `;
    alertsContainer.appendChild(alertDiv);
    setTimeout(() => {
        removeAlert(alertId);
    }, duration);
    return alertId;
}

function removeAlert(alertId) {
    const alert = document.querySelector(`[data-alert-id="${alertId}"]`);
    if (alert && alert.parentElement) {
        alert.remove();
    }
}

// Verificar alertas automáticas
function checkAutoAlerts() {
    const now = new Date();
    let hasActiveAlerts = false;
    Object.values(rooms).forEach(room => {
        room.incidents.forEach(incident => {
            if (incident.alertDate && incident.alertTime) {
                const alertDateTime = new Date(`${incident.alertDate}T${incident.alertTime}`);
                const diffTime = alertDateTime.getTime() - now.getTime();
                const diffMinutes = Math.ceil(diffTime / (1000 * 60));
                if (diffMinutes <= 15 && diffMinutes >= -5) {
                    hasActiveAlerts = true;
                    const roomCard = document.querySelector(`[data-room="${room.number}"]`);
                    if (roomCard && !roomCard.querySelector('.active-alert')) {
                        const alertIndicator = document.createElement('div');
                        alertIndicator.className = 'active-alert';
                        roomCard.appendChild(alertIndicator);
                    }
                    if (diffMinutes <= 0) {
                        showAlert(`🔴 ALERTA ACTIVA - Habitación ${room.number}: ${incident.alert || incident.description}`, 'warning', 8000, true);
                    }
                }
            }
        });
    });
    return hasActiveAlerts;
}

// Verificar si necesita notificación a dirección
function checkManagementNotification() {
    const severity = document.getElementById('incidentSeverity')?.value;
    const alertDiv = document.getElementById('managementAlert');
    if (!alertDiv) return;
    if (severity === 'grave' || severity === 'critica') {
        alertDiv.style.display = 'flex';
    } else {
        alertDiv.style.display = 'none';
    }
}

// Notificar a dirección
function notifyManagement() {
    const roomNumber = currentRoom;
    const severity = document.getElementById('incidentSeverity')?.value;
    const description = document.getElementById('incidentDescription')?.value;
    const notification = {
        id: Date.now(),
        roomNumber,
        severity,
        description,
        timestamp: new Date(),
        status: 'pending'
    };
    managementNotifications.push(notification);

    showAlert(`Notificación enviada a dirección para habitación ${roomNumber}. Se recomienda contactar con el huésped.`, 'success', 5000, true);
    const guestMessage = generateGuestMessage(severity, description);
    showAlert(`Mensaje sugerido para el huésped: "${guestMessage}"`, 'info', 8000, true);
}

function generateGuestMessage(severity, description) {
    const messages = {
        grave: `Estimado huésped, hemos detectado una incidencia en su habitación que requiere atención inmediata. Nos pondremos en contacto para resolverla lo antes posible. Disculpe las molestias.`,
        critica: `Estimado huésped, por su seguridad y comodidad, necesitamos acceder a su habitación de forma urgente para resolver una incidencia crítica. Un miembro del equipo se pondrá en contacto inmediatamente.`
    };
    return messages[severity] || 'Estimado huésped, estamos trabajando para resolver una incidencia en su habitación.';
}


// Notas habitación
function saveRoomNotes() {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room.roomInfo) room.roomInfo = {};
    room.roomInfo.description = document.getElementById('roomDescription')?.value.trim() || '';
    room.roomInfo.features = document.getElementById('roomFeatures')?.value.trim() || '';
    room.roomInfo.notes = document.getElementById('roomNotes')?.value.trim() || '';
 
    renderRooms();
    showAlert('Notas de habitación guardadas correctamente', 'success', 3000, true);
}

function clearRoomNotes() {
    if (!currentRoom) return;
    if (confirm('¿Estás seguro de que quieres limpiar todas las notas de la habitación?')) {
        rooms[currentRoom].roomInfo = { description: '', features: '', notes: '' };
        document.getElementById('roomDescription').value = '';
        document.getElementById('roomFeatures').value = '';
        document.getElementById('roomNotes').value = '';
    
        renderRooms();
        showAlert('Notas eliminadas', 'info', 3000, true);
    }
}

function updatePopularTags() {
    const type = document.getElementById('incidentType')?.value;
    const container = document.getElementById('popularTags');
    if (!container) return;
    const tags = frequentTags[type] || [];
    container.innerHTML = tags.map(tag =>
        `<div class="popular-tag frequent" onclick="selectTag('${tag}')">${tag}</div>`
    ).concat(
        (commonTags[type] || []).slice(0, 8).map(tag =>
            `<div class="popular-tag" onclick="selectTag('${tag}')">${tag}</div>`
        )
    ).join('');
}

function selectTag(tag) {
    const input = document.getElementById('incidentTag');
    if (input) input.value = tag;
}

function updateHistoryIndicator() {
    const indicator = document.getElementById('historyIndicator');
    if (!indicator) return;
    indicator.style.display = resolvedIncidents.length > 0 ? 'block' : 'none';
}

   
    
    // Cargar datos más recientes desde Supabase después de inicializar localmente
    if (typeof supabaseClient !== 'undefined') {
        cargarIncidenciasSupabase().then(() => {
            console.log('Datos sincronizados desde Supabase');
            renderRooms();
            updateStats();
        });
    }






// Cargar datos más recientes desde Supabase después de inicializar localmente
if (typeof supabaseClient !== 'undefined') {
    Promise.all([cargarIncidenciasSupabase(), cargarHuespedesSupabase()]).then(() => {
        console.log('Datos sincronizados desde Supabase');
        renderRooms();
        updateStats();
    });
}

function getRoomMainTags(room) {
    if (!room || room.incidents.length === 0) return [];
    const allTags = room.incidents.map(incident => incident.tag).filter(Boolean);
    const tagCounts = {};
    allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
    return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([tag]) => tag);
}

function getRoomMainIcon(room) {
    if (!room || room.incidents.length === 0) return '';
    const typeCounts = {};
    room.incidents.forEach(incident => {
        typeCounts[incident.type] = (typeCounts[incident.type] || 0) + 1;
    });
    const mainType = Object.keys(typeCounts).reduce((a, b) =>
        typeCounts[a] > typeCounts[b] ? a : b
    );
    return typeIcons[mainType] || '';
}

function sortRoomsByPriority() {
  const roomNumbers = Object.keys(rooms).map(Number);
  const statusPriority = { critica: 5, grave: 4, moderada: 3, leve: 2, bloqueada: 1, libre: 0 };

  return roomNumbers.sort((a, b) => {
    const A = rooms[a], B = rooms[b];
    const pa = statusPriority[A.status] ?? 0;
    const pb = statusPriority[B.status] ?? 0;
    if (pa !== pb) return pb - pa;

    const hasA = A.incidents && A.incidents.length > 0;
    const hasB = B.incidents && B.incidents.length > 0;
    if (hasA && hasB) {
      const oldestA = Math.min(...A.incidents.map(i => new Date(i.date).getTime()));
      const oldestB = Math.min(...B.incidents.map(i => new Date(i.date).getTime()));
      return oldestA - oldestB;
    }
    if (hasA) return -1;
    if (hasB) return 1;

    // sin incidencias: orden numérico ascendente
    return a - b;
  });
}

// Renderizar habitaciones
function renderFilteredRooms(filteredRooms) {
    const grid = document.getElementById('roomsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    filteredRooms.forEach(room => {
        const roomCard = document.createElement('div');
        roomCard.className = `room-card ${room.status}`;
        roomCard.setAttribute('data-room', room.number);
        roomCard.onclick = (e) => { e.preventDefault(); openModal(room.number); };
        roomCard.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, room.number); };

        const incidentCounts = { critica: 0, grave: 0, moderada: 0, leve: 0 };
        room.incidents.forEach(incident => { incidentCounts[incident.severity]++; });

        let incidentBadges = '';
        Object.entries(incidentCounts).forEach(([severity, count]) => {
            if (count > 0) {
                incidentBadges += `<div class="incident-badge ${severity}">${count}</div>`;
            }
        });

        let guestInfo = '';
        if (room.status === 'bloqueada' && (room.guest.name || room.guest.surname)) {
            guestInfo = `<div class="guest-info">${room.guest.name} ${room.guest.surname}${room.guest.pax > 0 ? ` (${room.guest.pax} pax)` : ''}</div>`;
        }

        const mainIcon = getRoomMainIcon(room);
        const mainTags = getRoomMainTags(room);
        const hasNotes = room.roomInfo && (room.roomInfo.description || room.roomInfo.features || room.roomInfo.notes);

        roomCard.innerHTML = `
           <div class="room-number">${room.number}</div>
           <div class="room-status">${getStatusText(room.status)}</div>

           ${hasNotes ? `<div class="notes-icon" style="position: absolute; bottom: 4px; left: 4px; background: #3b82f6; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 10px;">📝</div>` : ''}

           ${guestInfo}
           ${mainIcon ? `<div class="incident-type-icon">${mainIcon}</div>` : ''}
           ${mainTags.length > 0 ? `<div class="room-tags">${mainTags.map(tag => `<div class="room-tag">${tag}</div>`).join('')}</div>` : ''}
           ${incidentBadges ? `<div class="incident-badges">${incidentBadges}</div>` : ''}
       `;
        grid.appendChild(roomCard);
    });
}

function renderRooms() {
    const grid = document.getElementById('roomsGrid');
    if (!grid) return;

    const searchTerm = document.getElementById('searchRoom')?.value.toLowerCase() || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    const filterType = document.getElementById('filterType')?.value || '';
    const filterTag = document.getElementById('filterTag')?.value.toLowerCase() || '';

    grid.innerHTML = '';

    const sortedRoomNumbers = sortRoomsByPriority();

    sortedRoomNumbers.forEach(roomNumber => {
        const room = rooms[roomNumber];
        if (!room) return;

        // 🚨 en lugar de "return" cuando no cumple, marcamos un flag
        let matches = true;

        if (searchTerm && !room.number.toString().includes(searchTerm)) matches = false;
        if (filterStatus && room.status !== filterStatus) matches = false;
        if (filterType && !room.incidents.some(incident => incident.type === filterType)) matches = false;
        if (filterTag && !room.incidents.some(incident =>
            incident.tag && incident.tag.toLowerCase().includes(filterTag))) matches = false;

        const roomCard = document.createElement('div');
        roomCard.className = `room-card ${room.status}`;
        roomCard.setAttribute('data-room', roomNumber);
        roomCard.onclick = (e) => { e.preventDefault(); openModal(roomNumber); };
        roomCard.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, roomNumber); };

        const incidentCounts = { critica: 0, grave: 0, moderada: 0, leve: 0 };
        room.incidents.forEach(incident => { incidentCounts[incident.severity]++; });
        let incidentBadges = '';
        Object.entries(incidentCounts).forEach(([severity, count]) => {
            if (count > 0) {
                incidentBadges += `<div class="incident-badge ${severity}">${count}</div>`;
            }
        });

        let guestInfo = '';
        if (room.status === 'bloqueada' && (room.guest.name || room.guest.surname)) {
            guestInfo = `<div class="guest-info">${room.guest.name} ${room.guest.surname}${room.guest.pax > 0 ? ` (${room.guest.pax} pax)` : ''}</div>`;
        }

        const mainIcon = getRoomMainIcon(room);
        const mainTags = getRoomMainTags(room);
        const hasNotes = room.roomInfo && (room.roomInfo.description || room.roomInfo.features || room.roomInfo.notes);
        const hasGuest = room.guest && (room.guest.name || room.guest.surname);

        // 🚨 si no coincide con los filtros, lo mostramos igual pero "apagado"
        const opacity = matches ? "1" : "0.3";

        roomCard.innerHTML = `
            <div class="room-number" style="opacity:${opacity}">${room.number}</div>
            <div class="room-status" style="opacity:${opacity}">${getStatusText(room.status)}</div>
            ${hasNotes ? `<div class="notes-icon" style="opacity:${opacity}; position: absolute; bottom: 4px; left: 4px; background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 10px;">📝</div>` : ''}
            ${hasGuest ? `<div class="guest-icon" style="position: absolute; top: 4px; right: 4px; background: #22c55e; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px;">👤</div>` : ''}
            ${guestInfo}
            ${mainIcon ? `<div class="incident-type-icon" style="opacity:${opacity}">${mainIcon}</div>` : ''}
            ${mainTags.length > 0 ? `<div class="room-tags">${mainTags.map(tag => `<div class="room-tag" style="opacity:${opacity}">${tag}</div>`).join('')}</div>` : ''}
            ${incidentBadges ? `<div class="incident-badges" style="opacity:${opacity}">${incidentBadges}</div>` : ''}
        `;

        grid.appendChild(roomCard);
    });
}
function getOccupancyText(occupancyStatus) {
    const occupancyMap = {
        'libre': 'Libre',
        'bloqueada': 'Bloqueada',
        'ocupada': 'Ocupada'
    };
    return occupancyMap[occupancyStatus] || 'Libre';
}

function getStatusText(status) {
    const room = rooms[currentRoom] || Object.values(rooms).find(r => r.status === status);
    const occupancyText = room && room.occupancyStatus ?
        (room.occupancyStatus === 'libre' ? 'Libre' :
            room.occupancyStatus === 'bloqueada' ? 'Bloqueada' : 'Ocupada') : '';

    const statusMap = {
        'libre': 'Libre',
        'bloqueada': 'Bloqueada',
        'ocupada': 'Ocupada',
        'leve': occupancyText ? `${occupancyText} - Inc. leve` : 'Inc. leve',
        'moderada': occupancyText ? `${occupancyText} - Inc. moderada` : 'Inc. moderada',
        'grave': occupancyText ? `${occupancyText} - Inc. grave` : 'Inc. grave',
        'critica': occupancyText ? `${occupancyText} - Inc. crítica` : 'Inc. crítica'
    };
    return statusMap[status] || 'Libre';
}

function showContextMenu(event, roomNumber) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenuRoom = roomNumber;
    if (!contextMenu) return;
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
}

function markAsOccupied() {
    if (contextMenuRoom && rooms[contextMenuRoom]) {
        rooms[contextMenuRoom].occupancyStatus = 'ocupada';
        if (rooms[contextMenuRoom].incidents.length === 0) {
            rooms[contextMenuRoom].status = 'ocupada';
        }
       
        renderRooms();
        updateStats();
        openModal(contextMenuRoom, 'guest');
    }
    hideContextMenu();
}

function markAsBlocked() {
    if (contextMenuRoom && rooms[contextMenuRoom]) {
        rooms[contextMenuRoom].occupancyStatus = 'bloqueada';
        if (rooms[contextMenuRoom].incidents.length === 0) {
            rooms[contextMenuRoom].status = 'bloqueada';
        }
  
        renderRooms();
        updateStats();
    }
    hideContextMenu();
}

function markAsFree() {
    if (contextMenuRoom && rooms[contextMenuRoom]) {
        rooms[contextMenuRoom].occupancyStatus = 'libre';
        rooms[contextMenuRoom].guest = { name: '', surname: '', pax: 0, phone: '', agency: '', checkIn: '', checkOut: '' };
        if (rooms[contextMenuRoom].incidents.length === 0) {
            rooms[contextMenuRoom].status = 'libre';
        }
       
        renderRooms();
        updateStats();
    }
    hideContextMenu();
}

function hideContextMenu() {
    const ctx = document.getElementById('contextMenu');
    if (ctx) ctx.style.display = 'none';
    contextMenuRoom = null;
}

// Actualiza el estado de la habitación según incidencias / ocupación
function updateRoomStatus(roomNumber) {
    const room = rooms[roomNumber];
    if (!room) {
        console.error('Habitación no encontrada:', roomNumber);
        return;
    }
    if (!room.occupancyStatus) room.occupancyStatus = 'libre';
    if (room.incidents && room.incidents.length > 0) {
        if (room.incidents.some(i => i.severity === 'critica')) {
            room.status = 'critica';
        } else if (room.incidents.some(i => i.severity === 'grave')) {
            room.status = 'grave';
        } else if (room.incidents.some(i => i.severity === 'moderada')) {
            room.status = 'moderada';
        } else {
            room.status = 'leve';
        }
    } else {
        // Sin incidencias: estado visual según occupancyStatus
        room.status = room.occupancyStatus || 'libre';
    }
}

// Estadísticas
function updateStats() {
    let libres = 0,
        bloqueadas = 0,
        criticas = 0,
        incidencias = 0,
        alertasActivas = 0,
        caducadas = 0;

    const today = new Date().toISOString().split('T')[0];

    Object.values(rooms).forEach(room => {
        if (room.status === 'libre') libres++;
        if (room.status === 'bloqueada') bloqueadas++;
        if (room.status === 'critica') criticas++;
        if (room.incidents && room.incidents.length > 0) {
            incidencias++;
            room.incidents.forEach(incident => {
                if (incident.alertDate && incident.alertTime) alertasActivas++;
                if (incident.expiry && incident.expiry < today) caducadas++;
            });
        }
    });

    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText("libres", libres);
    setText("bloqueadas", bloqueadas);
    setText("criticas", criticas);
    setText("total-incidents", incidencias);
    setText("alertasActivas", alertasActivas);
    if (document.getElementById("caducadas")) setText("caducadas", caducadas);
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.modal-tab').forEach(tab => tab.classList.remove('active'));
    const tabButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (tabButton) tabButton.classList.add('active');
    let contentTab;
    switch (tabName) {
        case 'incidents':
            contentTab = document.getElementById('incidentsTab');
            updatePopularTags();
            break;
        case 'guest':
            contentTab = document.getElementById('guestTab');
            break;
        case 'room-notes':
            contentTab = document.getElementById('roomNotesTab');
            loadRoomNotes();
            break;
        case 'history':
            contentTab = document.getElementById('historyTab');
            renderRoomHistory();
            break;
    }
    if (contentTab) contentTab.classList.add('active');
}

function loadRoomNotes() {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    const roomInfo = room.roomInfo || {};
    document.getElementById('roomDescription').value = roomInfo.description || '';
    document.getElementById('roomFeatures').value = roomInfo.features || '';
    document.getElementById('roomNotes').value = roomInfo.notes || '';
}

function openModal(roomNumber, activeTab = 'incidents') {
    currentRoom = roomNumber;
    const room = rooms[roomNumber];
    if (!room) {
        console.error('Habitación no encontrada:', roomNumber);
        return;
    }
    document.getElementById('modalTitle').textContent = `Habitación ${roomNumber}`;
    const modal = document.getElementById('roomModal');
    if (modal) modal.style.display = 'block';
    document.getElementById('guestName').value = room.guest?.name || '';
    document.getElementById('guestSurname').value = room.guest?.surname || '';
    document.getElementById('guestPax').value = room.guest?.pax || '';
    document.getElementById('guestPhone').value = room.guest?.phone || '';
    document.getElementById('guestAgency').value = room.guest?.agency || '';
    document.getElementById('checkInDate').value = room.guest?.checkIn || '';
    document.getElementById('checkOutDate').value = room.guest?.checkOut || '';
    showTab(activeTab);
    renderIncidents();
}

function closeModal() {
    const modal = document.getElementById('roomModal');
    if (modal) modal.style.display = 'none';
    clearIncidentForm();
    currentRoom = null;
}

function clearIncidentForm() {
    const ids = ['incidentDescription', 'incidentTag', 'reportedBy', 'expiryDate', 'alertDate', 'alertTime', 'alertMessage', 'incidentSeverity', 'incidentType', 'incidentPriority'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const ma = document.getElementById('managementAlert'); if (ma) ma.style.display = 'none';
}

async function saveGuestInfo() {
    if (!currentRoom) return;
    
    const guestData = {
        habitacion: currentRoom,
        nombre: document.getElementById('guestName').value.trim(),
        apellidos: document.getElementById('guestSurname').value.trim(),
        pax: parseInt(document.getElementById('guestPax').value) || 0,
        telefono: document.getElementById('guestPhone').value.trim(),
        agencia: document.getElementById('guestAgency').value.trim(),
        fecha_entrada: document.getElementById('checkInDate').value || null,
        fecha_salida: document.getElementById('checkOutDate').value || null
    };

    console.log('Guardando huésped:', guestData);
const result = await guardarHuespedSupabase(guestData);
console.log('Resultado guardar huésped:', result);    if (result) {
        await cargarHuespedesSupabase();
        // Forzar actualización del estado de la habitación
rooms[currentRoom].occupancyStatus = 'bloqueada';
updateRoomStatus(currentRoom);
        showAlert('Información del huésped guardada correctamente', 'success', 3000, true);
    }
    
    if (result) {
    await cargarHuespedesSupabase();
    renderRooms(); // <-- AGREGAR ESTA LÍNEA
    updateStats(); // <-- Y ESTA TAMBIÉN
    showAlert('Información del huésped guardada correctamente', 'success', 3000, true);
}
}

async function clearGuestInfo() {
    if (!currentRoom) return;
    if (confirm('¿Estás seguro de que quieres limpiar toda la información del huésped?')) {
        const { error } = await supabaseClient
            .from("huespedes")
            .update({ activo: false })
            .eq('habitacion', currentRoom);
            
        if (error) {
            console.error("Error al eliminar huésped en Supabase:", error);
            showAlert("Error al eliminar huésped en Supabase", "error", 3000, true);
            return;
        }
        
        await cargarHuespedesSupabase();
        
        // Forzar actualización del estado de la habitación
        rooms[currentRoom].occupancyStatus = 'libre';
        updateRoomStatus(currentRoom);
        renderRooms();
        updateStats();
        showAlert('Información del huésped eliminada', 'info', 3000, true);
    }
}

// ---- Supabase helpers (funciones top-level) ----

// Nota: supabaseClient debe estar definido en otro archivo globalmente.
async function guardarIncidenciaSupabase(incidentData) {
    try {
        const { data, error } = await supabaseClient
            .from("incidencias")
            .insert([incidentData])
            .select();
        if (error) {
            console.error("❌ Error al guardar en Supabase:", error);
            showAlert("Error al guardar incidencia en Supabase", "error", 3000, true);
            return null;
        }
        return data;
    } catch (err) {
        console.error('Error en guardarIncidenciaSupabase:', err);
        showAlert("Error al guardar incidencia en Supabase", "error", 3000, true);
        return null;
    }
}

function initializeRooms() {
    // Solo crear habitaciones que no existan ya
    for (let i = 1; i <= 200; i++) {
        if (!rooms[i]) {
            rooms[i] = {
                number: i,
                incidents: [],
                status: 'libre',
                guest: { name: '', surname: '', pax: 0, phone: '', agency: '', checkIn: '', checkOut: '' },
                roomInfo: { description: '', features: '', notes: '' },
                occupancyStatus: 'libre'
            };
        }
    }
}

async function cargarIncidenciasSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from('incidencias')
      .select('*')
      .eq('resuelta', false);

    if (error) {
      console.error('❌ Error al cargar incidencias:', error);
      return [];
    }

    // Limpia solo las incidencias, no las habitaciones
    Object.keys(rooms).forEach((roomNum) => {
      rooms[roomNum].incidents = [];
    });

    // Inserta incidencias en sus habitaciones (si llega una fuera de rango, la “esqueletiza”)
    data.forEach((inc) => {
    
    // AGREGAR ESTAS LÍNEAS:
Object.keys(rooms).forEach(roomNum => {
  updateRoomStatus(roomNum);
});
      const n = inc.habitacion;
      if (!rooms[n]) {
        rooms[n] = {
          number: n,
          incidents: [],
          status: 'libre',
          guest: { name: '', surname: '', pax: 0, phone: '', agency: '', checkIn: '', checkOut: '' },
          roomInfo: { description: '', features: '', notes: '' },
          occupancyStatus: 'libre'
        };
      }
      rooms[n].incidents.push({
        id: inc.id,
        severity: inc.gravedad,
        type: inc.tipo,
        priority: inc.prioridad,
        description: inc.descripcion,
        tag: inc.etiqueta,
        reportedBy: inc.reportado_por,
        date: new Date(inc.fecha_creacion),
        expiry: inc.fecha_limite,
        resolved: inc.resuelta,
        alert: inc.alerta || null,
        alertDate: inc.fecha_alerta || null,
        alertTime: inc.hora_alerta || null
      });
      updateRoomStatus(n);
    });

    renderRooms();
    updateStats();
    return data;
  } catch (err) {
    console.error('Error en cargarIncidenciasSupabase:', err);
    return [];
  }
}

async function guardarHuespedSupabase(guestData) {
    try {
        // Primero verificar si ya existe
        const { data: existing } = await supabaseClient
            .from("huespedes")
            .select('id')
            .eq('habitacion', guestData.habitacion)
            .eq('activo', true);
            
        let data, error;
        
        if (existing && existing.length > 0) {
            // Actualizar existente
            const result = await supabaseClient
                .from("huespedes")
                .update(guestData)
                .eq('habitacion', guestData.habitacion)
                .eq('activo', true)
                .select();
            data = result.data;
            error = result.error;
        } else {
            // Insertar nuevo
            const result = await supabaseClient
                .from("huespedes")
                .insert([guestData])
                .select();
            data = result.data;
            error = result.error;
        }
        
        if (error) {
            console.error("Error al guardar huésped en Supabase:", error);
            return null;
        }
        console.log('Huésped guardado en Supabase:', data);
        return data;
    } catch (err) {
        console.error('Error en guardarHuespedSupabase:', err);
        return null;
    }
}
async function cargarHuespedesSupabase() {
    try {
        const { data, error } = await supabaseClient
    .from('huespedes')
    .select('*')
    .eq('activo', true);
        
        if (error) {
            console.error('Error al cargar huéspedes:', error);
            return;
        }
        
        // Limpiar todos los huéspedes antes de cargar
        Object.keys(rooms).forEach(roomNum => {
            rooms[roomNum].guest = { name: '', surname: '', pax: 0, phone: '', agency: '', checkIn: '', checkOut: '' };
        });
        
        data.forEach((huesped) => {
            const roomNum = huesped.habitacion;
            if (rooms[roomNum]) {
                rooms[roomNum].guest = {
                    name: huesped.nombre || '',
                    surname: huesped.apellidos || '',
                    pax: huesped.pax || 0,
                    phone: huesped.telefono || '',
                    agency: huesped.agencia || '',
                    checkIn: huesped.fecha_entrada || '',
                    checkOut: huesped.fecha_salida || ''
                };
                updateRoomStatus(roomNum);
            }
        });

        // MOVER ESTE BLOQUE AQUÍ - fuera del forEach
        if (currentRoom) {
            const room = rooms[currentRoom];
            const roomInfo = room.guest || {};
            ['guestName', 'guestSurname', 'guestPax', 'guestPhone', 'guestAgency', 'checkInDate', 'checkOutDate'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    switch(id) {
                        case 'guestName': el.value = roomInfo.name || ''; break;
                        case 'guestSurname': el.value = roomInfo.surname || ''; break;
                        case 'guestPax': el.value = roomInfo.pax || ''; break;
                        case 'guestPhone': el.value = roomInfo.phone || ''; break;
                        case 'guestAgency': el.value = roomInfo.agency || ''; break;
                        case 'checkInDate': el.value = roomInfo.checkIn || ''; break;
                        case 'checkOutDate': el.value = roomInfo.checkOut || ''; break;
                    }
                }
            });
        }
        
        // Actualizar estados de ocupación basados en los datos cargados
Object.keys(rooms).forEach(roomNum => {
    const hasGuest = data.find(h => h.habitacion == roomNum);
    if (hasGuest) {
        rooms[roomNum].occupancyStatus = 'bloqueada';
    } else {
        rooms[roomNum].occupancyStatus = 'libre';
    }
    updateRoomStatus(roomNum);
});

renderRooms();
updateStats();
        
    } catch (err) {
        console.error('Error en cargarHuespedesSupabase:', err);
    }
}



async function addIncident() {
    if (!currentRoom) return;

    const severity = document.getElementById("incidentSeverity")?.value;
    const type = document.getElementById("incidentType")?.value;
    const priority = document.getElementById("incidentPriority")?.value;
    const description = document.getElementById("incidentDescription")?.value.trim();
    const tag = document.getElementById("incidentTag")?.value.trim();
    const reportedBy = document.getElementById("reportedBy")?.value.trim();
    const expiryDate = document.getElementById("expiryDate")?.value || null;
    const alertDate = document.getElementById("alertDate")?.value || null;
    const alertTime = document.getElementById("alertTime")?.value || null;
    const alertMessage = document.getElementById("alertMessage")?.value.trim();

    if (!description) {
        showAlert("Por favor, ingresa una descripción de la incidencia", "warning", 3000, true);
        return;
    }

    const incidentData = {
        habitacion: parseInt(currentRoom, 10),           // INTEGER NOT NULL
        descripcion: description,                        // TEXT NOT NULL
        gravedad: severity,                              // TEXT NOT NULL
        tipo: type,                                      // TEXT NOT NULL
        prioridad: priority,                             // TEXT NOT NULL
        etiqueta: tag || "sin etiqueta",                 // TEXT
        reportado_por: reportedBy || "No especificado",  // TEXT
        fecha_creacion: new Date().toISOString(),        // TIMESTAMPTZ
        fecha_limite: expiryDate,                        // DATE
        resuelta: false,                                 // BOOLEAN
        alerta: alertMessage || null,                    // TEXT
        fecha_alerta: alertDate,                         // DATE
        hora_alerta: alertTime                           // TIME
    };

    console.log("📤 Enviando a Supabase:", incidentData);

    const result = await guardarIncidenciaSupabase(incidentData);
    if (result) {
        await cargarIncidenciasSupabase();
        clearIncidentForm();
        renderIncidents();
        showAlert("✅ Incidencia agregada correctamente", "success", 3000, true);
    }
}
function isExpired(incident) {
    if (!incident.expiry) return false;
    const today = new Date();
    const expiryDate = new Date(incident.expiry);
    return today > expiryDate;
}

function renderIncidents() {
    if (!currentRoom) return;
    const incidentsList = document.getElementById('incidentsList');
    const room = rooms[currentRoom];
    if (!incidentsList) return;
    if (!room || room.incidents.length === 0) {
        incidentsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 15px;">No hay incidencias registradas</p>';
        return;
    }

    const sortedIncidents = [...room.incidents].sort((a, b) => {
        const severityPriority = { 'critica': 4, 'grave': 3, 'moderada': 2, 'leve': 1 };
        const priorityA = severityPriority[a.severity] || 0;
        const priorityB = severityPriority[b.severity] || 0;
        if (priorityA !== priorityB) return priorityB - priorityA;
        return a.date.getTime() - b.date.getTime();
    });

    incidentsList.innerHTML = sortedIncidents.map(incident => {
        const expired = isExpired(incident);
        const hasScheduledAlert = incident.alertDate && incident.alertTime;
        return `
               <div class="incident-item ${incident.severity} ${expired ? 'expired' : ''}">
                   <div class="incident-header">
                       <div class="incident-type-tags">
                           <span class="incident-severity ${incident.severity}">${incident.severity}</span>
                           <span class="incident-type">${typeIcons[incident.type] || ''} ${incident.type}</span>
                           <span class="incident-tag" onclick="selectTag('${incident.tag || ''}')">${incident.tag || ''}</span>
                       </div>
                       <div class="incident-date-info" style="text-align: right; font-size: 11px; color: #6b7280;">
                           <div>${incident.date ? incident.date.toLocaleDateString() + ' ' + incident.date.toLocaleTimeString() : ''}</div>
                           ${incident.expiry ? `<div>Límite: ${new Date(incident.expiry).toLocaleDateString()}</div>` : ''}
                           ${hasScheduledAlert ? `<div>🔔 Alerta: ${incident.alertDate} ${incident.alertTime}</div>` : ''}
                           ${expired ? '<div style="color: #ef4444; font-weight: 600;">CADUCADO</div>' : ''}
                       </div>
                   </div>
                   <div style="margin-bottom: 8px; line-height: 1.4;">${incident.description}</div>
                   ${incident.alert ? `<div style="background: #fffbeb; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 12px; border-left: 3px solid #f59e0b;"><strong>Recordatorio:</strong> ${incident.alert}</div>` : ''}
                   <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #6b7280;">
                       <span>Reportado por: ${incident.reportedBy} | Prioridad: ${incident.priority}</span>
                       <div>
                           <button onclick="resolveIncident(${incident.id})" class="btn" style="background: #22c55e; color: white; padding: 4px 8px; font-size: 10px; margin-right: 4px;">✓ Resolver</button>
                           <button onclick="removeIncident(${incident.id})" class="btn" style="background: #ef4444; color: white; padding: 4px 8px; font-size: 10px;">✕ Eliminar</button>
                       </div>
                   </div>
               </div>
           `;
    }).join('');
}

async function resolveIncident(incidentId) {
  if (!currentRoom) return;

  // Marca como resuelta en Supabase (mantiene histórico)
  const { error } = await supabaseClient
    .from('incidencias')
    .update({ resuelta: true })
    .eq('id', incidentId);

  if (error) {
    console.error('❌ Error al resolver en Supabase:', error);
    showAlert('Error al resolver incidencia en Supabase', 'error', 3000, true);
    return;
  }

  // Refresca desde Supabase para que todas las sesiones vean el cambio
  await cargarIncidenciasSupabase();
  renderIncidents();
  showAlert('Incidencia resuelta', 'success', 3000, true);
}

async function removeIncident(incidentId) {
  if (!currentRoom) return;

  // Opción A: borrar del todo
  // const { error } = await supabaseClient.from('incidencias').delete().eq('id', incidentId);

  // Opción B (recomendada): marcar como resuelta = “eliminada” de la vista actual
  const { error } = await supabaseClient
    .from('incidencias')
    .update({ resuelta: true })
    .eq('id', incidentId);

  if (error) {
    console.error('❌ Error al eliminar en Supabase:', error);
    showAlert('Error al eliminar incidencia en Supabase', 'error', 3000, true);
    return;
  }

  await cargarIncidenciasSupabase();
  renderIncidents();
  showAlert('Incidencia eliminada', 'info', 3000, true);
}


async function resolveAllIncidents() {
    if (!currentRoom) return;

    const roomIncidents = rooms[currentRoom]?.incidents || [];
    if (roomIncidents.length === 0) {
        showAlert("No hay incidencias que resolver en esta habitación", "info", 3000, true);
        return;
    }

    try {
        const ids = roomIncidents.map(inc => inc.id);

        const { error } = await supabaseClient
            .from("incidencias")
            .update({ resuelta: true })
            .in("id", ids);

        if (error) {
            console.error("❌ Error al resolver incidencias en Supabase:", error);
            showAlert("Error al resolver incidencias en Supabase", "error", 3000, true);
            return;
        }

        await cargarIncidenciasSupabase();
        showAlert("✅ Todas las incidencias de la habitación han sido resueltas", "success", 3000, true);

    } catch (err) {
        console.error("Error en resolveAllIncidents:", err);
    }
}

async function clearAllIncidents() {
    if (!currentRoom) return;

    const roomIncidents = rooms[currentRoom]?.incidents || [];
    if (roomIncidents.length === 0) {
        showAlert("No hay incidencias que eliminar en esta habitación", "info", 3000, true);
        return;
    }

    try {
        const ids = roomIncidents.map(inc => inc.id);

        const { error } = await supabaseClient
            .from("incidencias")
            .delete()
            .in("id", ids);

        if (error) {
            console.error("❌ Error al eliminar incidencias en Supabase:", error);
            showAlert("Error al eliminar incidencias en Supabase", "error", 3000, true);
            return;
        }

        await cargarIncidenciasSupabase();
        showAlert("🗑️ Todas las incidencias de la habitación han sido eliminadas", "info", 3000, true);

    } catch (err) {
        console.error("Error en clearAllIncidents:", err);
    }
}
// Historial de habitación
function renderRoomHistory() {
    if (!currentRoom) return;
    const historyList = document.getElementById('roomHistoryList');
    if (!historyList) return;
    const roomHistory = resolvedIncidents.filter(incident => incident.roomNumber === currentRoom);
    if (roomHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 15px;">No hay incidencias resueltas</p>';
        return;
    }
    const sortedHistory = [...roomHistory].sort((a, b) => b.resolvedDate.getTime() - a.resolvedDate.getTime());
    historyList.innerHTML = sortedHistory.map(incident => `
               <div class="history-item" style="background: #f1f5f9; padding: 10px; border-left: 3px solid #6b7280; margin-bottom: 8px; border-radius: 0 6px 6px 0; font-size: 12px;">
                   <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                       <div>
                           <span style="background: #22c55e; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; text-transform: uppercase; margin-right: 4px;">RESUELTO</span>
                           <span class="incident-severity ${incident.severity}">${incident.severity}</span>
                           <span class="incident-type">${typeIcons[incident.type] || ''} ${incident.type}</span>
                           <span class="incident-tag">${incident.tag}</span>
                       </div>
                       <div style="text-align: right; font-size: 10px; color: #6b7280;">
                           <div>Creado: ${incident.date ? incident.date.toLocaleDateString() : ''}</div>
                           <div>Resuelto: ${incident.resolvedDate ? incident.resolvedDate.toLocaleDateString() : ''}</div>
                       </div>
                   </div>
                   <div style="margin-bottom: 6px;">${incident.description}</div>
                   <div style="font-size: 10px; color: #6b7280;">
                       Reportado por: ${incident.reportedBy} | Resuelto por: ${incident.resolvedBy} | Prioridad: ${incident.priority}
                   </div>
               </div>
           `).join('');
}

// Verificar alertas programadas (solo manual por botón)
function checkAlerts() {
    let alertCount = 0;
    const now = new Date();
    const alerts = [];
    Object.values(rooms).forEach(room => {
        room.incidents.forEach(incident => {
            if (incident.expiry) {
                const expiryDate = new Date(incident.expiry);
                const diffTime = expiryDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 1 && diffDays >= 0) {
                    alerts.push({ type: 'warning', priority: diffDays === 0 ? 5 : 4, message: `Habitación ${room.number}: ${incident.description} - Caduca ${diffDays === 0 ? 'HOY' : 'mañana'}`, date: expiryDate });
                } else if (diffDays < 0) {
                    alerts.push({ type: 'error', priority: 6, message: `Habitación ${room.number}: ${incident.description} - CADUCADO`, date: expiryDate });
                }
            }
            if (incident.alertDate && incident.alertTime) {
                const alertDateTime = new Date(`${incident.alertDate}T${incident.alertTime}`);
                const diffTime = alertDateTime.getTime() - now.getTime();
                const diffMinutes = Math.ceil(diffTime / (1000 * 60));
                if (diffMinutes <= 60 && diffMinutes >= -5) {
                    let alertType = 'info';
                    let priority = 2;
                    if (diffMinutes <= 0) { alertType = 'warning'; priority = 5; } else if (diffMinutes <= 15) { alertType = 'info'; priority = 4; }
                    alerts.push({ type: alertType, priority: priority, message: `Habitación ${room.number}: ${incident.alert || incident.description} - ${diffMinutes <= 0 ? 'AHORA' : `en ${diffMinutes} min`}`, date: alertDateTime });
                }
            }
        });
    });

    alerts.sort((a, b) => (b.priority - a.priority) || (a.date.getTime() - b.date.getTime()));
    alerts.forEach((alert, index) => {
        setTimeout(() => showAlert(alert.message, alert.type, 7000, true), index * 500);
    });

    alertCount = alerts.length;
    if (alertCount === 0) {
        showAlert('No hay alertas pendientes', 'success', 3000, true);
    } else {
        showAlert(`Se encontraron ${alertCount} alertas`, 'info', 3000, true);
    }
}

// Exportar datos
function exportData() {
    const data = [];
    Object.values(rooms).forEach(room => {
        if (!room.incidents || room.incidents.length === 0) {
            data.push({
                habitacion: room.number,
                estado: getStatusText(room.status),
                huesped: `${room.guest.name} ${room.guest.surname}`.trim(),
                pax: room.guest.pax || '',
                telefono: room.guest.phone || '',
                agencia: room.guest.agency || '',
                entrada: room.guest.checkIn || '',
                salida: room.guest.checkOut || '',
                descripcion_habitacion: room.roomInfo?.description || '',
                caracteristicas: room.roomInfo?.features || '',
                notas: room.roomInfo?.notes || '',
                gravedad: '',
                tipologia: '',
                prioridad: '',
                tag: '',
                descripcion_incidencia: '',
                reportado_por: '',
                fecha: '',
                caducidad: '',
                caducado: '',
                alerta: '',
                fecha_alerta: '',
                hora_alerta: ''
            });
        } else {
            room.incidents.forEach(incident => {
                data.push({
                    habitacion: room.number,
                    estado: getStatusText(room.status),
                    huesped: `${room.guest.name} ${room.guest.surname}`.trim(),
                    pax: room.guest.pax || '',
                    telefono: room.guest.phone || '',
                    agencia: room.guest.agency || '',
                    entrada: room.guest.checkIn || '',
                    salida: room.guest.checkOut || '',
                    descripcion_habitacion: room.roomInfo?.description || '',
                    caracteristicas: room.roomInfo?.features || '',
                    notas: room.roomInfo?.notes || '',
                    gravedad: incident.severity,
                    tipologia: incident.type,
                    prioridad: incident.priority,
                    tag: incident.tag || '',
                    descripcion_incidencia: incident.description,
                    reportado_por: incident.reportedBy,
                    fecha: incident.date ? incident.date.toLocaleDateString() + ' ' + incident.date.toLocaleTimeString() : '',
                    caducidad: incident.expiry ? new Date(incident.expiry).toLocaleDateString() : '',
                    caducado: isExpired(incident) ? 'SÍ' : 'NO',
                    alerta: incident.alert || '',
                    fecha_alerta: incident.alertDate || '',
                    hora_alerta: incident.alertTime || ''
                });
            });
        }
    });

    const csv = 'data:text/csv;charset=utf-8,' +
        'Habitación,Estado,Huésped,PAX,Teléfono,Agencia,Entrada,Salida,Descripción Habitación,Características,Notas,Gravedad,Tipología,Prioridad,Tag,Descripción Incidencia,Reportado por,Fecha,Caducidad,Caducado,Alerta,Fecha Alerta,Hora Alerta\n' +
        data.map(row => Object.values(row).map(val => `"${val}"`).join(',')).join('\n');

    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `incidencias_hotel_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showAlert('Datos exportados correctamente', 'success', 3000, true);
}

function exportHistoryData() {
    if (resolvedIncidents.length === 0) {
        showAlert('No hay datos en el historial para exportar', 'warning', 3000, true);
        return;
    }
    const data = resolvedIncidents.map(incident => ({
        habitacion: incident.roomNumber,
        gravedad: incident.severity,
        tipologia: incident.type,
        prioridad: incident.priority,
        tag: incident.tag || '',
        descripcion: incident.description,
        reportado_por: incident.reportedBy,
        fecha_creacion: incident.date ? incident.date.toLocaleDateString() + ' ' + incident.date.toLocaleTimeString() : '',
        fecha_resolucion: incident.resolvedDate ? incident.resolvedDate.toLocaleDateString() + ' ' + incident.resolvedDate.toLocaleTimeString() : '',
        resuelto_por: incident.resolvedBy,
        caducidad: incident.expiry ? new Date(incident.expiry).toLocaleDateString() : '',
        alerta: incident.alert || '',
        fecha_alerta: incident.alertDate || '',
        hora_alerta: incident.alertTime || ''
    }));

    const csv = 'data:text/csv;charset=utf-8,' +
        'Habitación,Gravedad,Tipología,Prioridad,Tag,Descripción,Reportado por,Fecha Creación,Fecha Resolución,Resuelto por,Caducidad,Alerta,Fecha Alerta,Hora Alerta\n' +
        data.map(row => Object.values(row).map(val => `"${val}"`).join(',')).join('\n');

    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `historial_incidencias_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showAlert('Historial exportado correctamente', 'success', 3000, true);
}

function clearAllData() {
    if (confirm('⚠️ ATENCIÓN: Esto borrará TODOS los datos del sistema (habitaciones, huéspedes, incidencias E HISTORIAL). Esta acción no se puede deshacer.\n\n¿Estás absolutamente seguro?')) {
        if (confirm('🚨 CONFIRMACIÓN FINAL: ¿Realmente quieres borrar TODOS los datos? Escribe OK en la siguiente ventana para confirmar.')) {
            const confirmText = prompt('Escribe "OK" para confirmar el borrado completo:');
            if (confirmText === 'OK') {
                localStorage.removeItem('hotelRooms');
                localStorage.removeItem('hotelResolvedIncidents');
                localStorage.removeItem('hotelManagementNotifications');
                rooms = {};
                resolvedIncidents = [];
                managementNotifications = [];
              

                               closeModal();
                closeHistoryModal();
                showAlert('Todos los datos han sido eliminados', 'success', 3000, true);
            } else {
                showAlert('Operación cancelada', 'info', 3000, true);
            }
        }
    }
}

// Event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchRoom');
    const filterStatus = document.getElementById('filterStatus');
    const filterType = document.getElementById('filterType');
    const filterTag = document.getElementById('filterTag');

    if (searchInput) searchInput.addEventListener('input', renderRooms);
    if (filterStatus) filterStatus.addEventListener('change', renderRooms);
    if (filterType) filterType.addEventListener('change', renderRooms);
    if (filterTag) filterTag.addEventListener('input', renderRooms);

    window.addEventListener('click', function(event) {
        const roomModal = document.getElementById('roomModal');
        const historyModal = document.getElementById('historyModal');
        if (event.target === roomModal) closeModal();
        if (event.target === historyModal) closeHistoryModal();
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('#contextMenu')) {
            hideContextMenu();
        }
    });

    document.addEventListener('mouseover', function(e) {
        if (e.target.classList && e.target.classList.contains('context-menu-item')) {
            e.target.style.background = '#f8fafc';
            e.target.style.color = '#1e293b';
        }
    });

    document.addEventListener('mouseout', function(e) {
        if (e.target.classList && e.target.classList.contains('context-menu-item')) {
            e.target.style.background = 'white';
            e.target.style.color = '#1e293b';
        }
    });

   
    // Verificar alertas automáticas cada 5 minutos
    setInterval(checkAutoAlerts, 300000); // 5 minutos
}

// Modal historial general
function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'block';
    renderGeneralHistory();
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
}

function renderGeneralHistory() {
    const list = document.getElementById('generalHistoryList');
    if (!list) return;
    if (resolvedIncidents.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No hay incidencias resueltas en el historial</p>';
        return;
    }
    filterHistory();
}

function filterHistory() {
    const searchTerm = (document.getElementById('historySearch')?.value || '').toLowerCase();
    const filterType = document.getElementById('historyFilterType')?.value;
    const filterSeverity = document.getElementById('historyFilterSeverity')?.value;
    const historyList = document.getElementById('generalHistoryList');
    if (!historyList) return;

    let filteredHistory = resolvedIncidents.filter(incident => {
        const matchesSearch = !searchTerm ||
            (incident.description || '').toLowerCase().includes(searchTerm) ||
            (incident.tag || '').toLowerCase().includes(searchTerm) ||
            incident.roomNumber.toString().includes(searchTerm);

        const matchesType = !filterType || incident.type === filterType;
        const matchesSeverity = !filterSeverity || incident.severity === filterSeverity;
        return matchesSearch && matchesType && matchesSeverity;
    });

    filteredHistory.sort((a, b) => b.resolvedDate.getTime() - a.resolvedDate.getTime());

    if (filteredHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 15px;">No se encontraron incidencias con los filtros aplicados</p>';
        return;
    }

    historyList.innerHTML = filteredHistory.map(incident => `
       <div class="history-item" style="background: #f1f5f9; padding: 10px; border-left: 3px solid #6b7280; margin-bottom: 8px; border-radius: 0 6px 6px 0; font-size: 12px; opacity: 0.9;">
           <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
               <div>
                   <span style="background: #22c55e; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; text-transform: uppercase; margin-right: 4px;">RESUELTO</span>
                   <span class="incident-severity ${incident.severity}">${incident.severity}</span>
                   <span class="incident-type">${typeIcons[incident.type] || ''} ${incident.type}</span>
                   <span class="incident-tag">${incident.tag}</span>
               </div>
               <div style="text-align: right; font-size: 10px; color: #6b7280;">
                   <div>Creado: ${incident.date ? incident.date.toLocaleDateString() : ''}</div>
                   <div>Resuelto: ${incident.resolvedDate ? incident.resolvedDate.toLocaleDateString() : ''}</div>
               </div>
           </div>
           <div style="margin-bottom: 6px;">${incident.description}</div>
           <div style="font-size: 10px; color: #6b7280;">
               Reportado por: ${incident.reportedBy} | Resuelto por: ${incident.resolvedBy} | Prioridad: ${incident.priority}
           </div>
       </div>
   `).join('');
}

// Inicializar
function initialize() {
    try {
       
        setupEventListeners();
      
        setupSupabaseSubscription();
		setupHuespedesSubscription();
		
		initializeRooms();

        // Verificar alertas automáticas al cargar
        setTimeout(() => { checkAutoAlerts(); }, 3000);

        console.log('Sistema inicializado correctamente');
        showAlert('Sistema de gestión hotelera iniciado correctamente', 'success', 3000, true);
    } catch (error) {
        console.error('Error al inicializar:', error);
        showAlert('Error al inicializar el sistema', 'error', 3000, true);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}



// --- Integración webapp simple (guardar / leer) ---
async function guardar() {
    const data = { titulo: "Prueba", descripcion: "Desde HTML" };
    await fetch(WEBAPP_URL, { method: "POST", body: JSON.stringify(data) });
}

async function leer() {
    const res = await fetch(WEBAPP_URL);
    const datos = await res.json();
    console.log(datos);
}

// ---- Calendario ----
let currentCalendarDate = new Date();
let selectedDate = null;
let calendarEvents = JSON.parse(localStorage.getItem("hotelCalendarEvents")) || {};

function renderCalendar() {
    const grid = document.getElementById("calendarGrid");
    const monthSpan = document.getElementById("currentMonth");
    if (!grid || !monthSpan) return;

    monthSpan.textContent = currentCalendarDate.toLocaleDateString("es-ES", { month: 'long', year: 'numeric' }).toUpperCase();
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - (firstDay.getDay() || 7) + 1); // Empezar en lunes
    grid.innerHTML = "";

    const dayHeaders = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    dayHeaders.forEach(day => {
        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = "background: #DCDCDC; color: #1e293b; padding: 8px 4px; text-align: center; font-weight: 600; font-size: 12px;";
        headerDiv.textContent = day;
        grid.appendChild(headerDiv);
    });

    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateKey = formatDateKeyLocal(date);
        const dayDiv = document.createElement("div");
        const isCurrentMonth = date.getMonth() === currentCalendarDate.getMonth();
        const isToday = date.toDateString() === new Date().toDateString();
        const hasEvents = calendarEvents[dateKey] && calendarEvents[dateKey].length > 0;
        dayDiv.style.cssText = `
           background: ${isCurrentMonth ? 'white' : '#f9fafb'};
           padding: 6px 4px;
           text-align: center;
           cursor: pointer;
           min-height: 32px;
           position: relative;
           border: 2px solid ${selectedDate === dateKey ? '#3b82f6' : 'transparent'};
           ${isToday ? 'box-shadow: inset 0 0 0 2px #ef4444;' : ''}
       `;
        dayDiv.innerHTML = `
           <div style="font-size: 12px; font-weight: ${isToday ? '700' : '500'}; color: ${isCurrentMonth ? '#1e293b' : '#9ca3af'};">
               ${date.getDate()}
           </div>
           ${hasEvents ? '<div style="position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; background: #3b82f6; border-radius: 50%;"></div>' : ''}
       `;
        dayDiv.onclick = () => selectDate(dateKey, date);
        grid.appendChild(dayDiv);
    }
}

function selectDate(dateKey, date) {
    selectedDate = dateKey;
    const selectedEl = document.getElementById("selectedDate");
    if (selectedEl) {
        selectedEl.textContent = date.toLocaleDateString("es-ES", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    renderCalendar();
    renderDayEvents();
}

function renderDayEvents() {
    const container = document.getElementById("dayEvents");
    if (!container) return;
    if (!selectedDate) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Selecciona un día para ver eventos</p>';
        return;
    }
    const events = calendarEvents[selectedDate] || [];
    if (events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No hay eventos para este día</p>';
        return;
    }
    container.innerHTML = events.map((event, idx) => {
        const typeColors = { nota: '#3b82f6', mantenimiento: '#f59e0b', reserva: '#22c55e', alerta: '#ef4444' };
        return `
           <div style="background: #f8fafc; border-left: 4px solid ${typeColors[event.type]}; padding: 8px; margin-bottom: 6px; border-radius: 0 6px 6px 0;">
               <div style="display: flex; justify-content: space-between; align-items: start;">
                   <div>
                       <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">
                           ${event.type === 'nota' ? '📝' : event.type === 'mantenimiento' ? '🔧' : event.type === 'reserva' ? '🏨' : '⚠️'} 
                           ${event.title}
                           ${event.time ? `<span style="font-size: 11px; color: #6b7280; margin-left: 8px;">${event.time}</span>` : ''}
                       </div>
                       ${event.description ? `<div style="font-size: 12px; color: #4b5563;">${event.description}</div>` : ''}
                   </div>
                   <button onclick="deleteCalendarEvent(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;">×</button>
               </div>
           </div>
       `;
    }).join('');
}

function renderEventList() {
    const listContainer = document.getElementById("eventList");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    const sortedDates = Object.keys(calendarEvents).sort((a, b) => new Date(a) - new Date(b));
    sortedDates.forEach(dateKey => {
        const events = calendarEvents[dateKey];
        events.forEach((event) => {
            const eventDiv = document.createElement("div");
            eventDiv.style.padding = "6px";
            eventDiv.style.borderBottom = "1px solid #e5e7eb";
            eventDiv.innerHTML = `
               <strong>${formatDateEU(dateKey)}</strong> - 
               ${event.type === 'nota' ? '📝' : event.type === 'mantenimiento' ? '🔧' : event.type === 'reserva' ? '🏨' : '⚠️'}
               ${event.title || '(Sin título)'} 
               ${event.time ? `<span style="color:#64748b;">(${event.time})</span>` : ''}
               <br>
               <small style="color:#334155;">${event.description || ''}</small>
           `;
            listContainer.appendChild(eventDiv);
        });
    });
    if (!sortedDates.length) {
        listContainer.innerHTML = "<p style='color:#6b7280; padding: 10px;'>No hay eventos registrados.</p>";
    }
}

function formatDateEU(isoDate) {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

function showEventModal() {
    if (!selectedDate) { alert("Selecciona primero un día del calendario"); return; }
    const modal = document.getElementById("eventModal");
    if (modal) modal.style.display = "block";
}

function closeEventModal() {
    const modal = document.getElementById("eventModal");
    if (modal) modal.style.display = "none";
    const ids = ['eventTitle', 'eventDescription', 'eventTime', 'eventType'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById("eventType").value = "nota";
}

function addCalendarEvent() {
    const title = document.getElementById("eventTitle")?.value.trim();
    if (!title || !selectedDate) return;
    const event = {
        type: document.getElementById("eventType")?.value || 'nota',
        title: title,
        description: document.getElementById("eventDescription")?.value.trim(),
        time: document.getElementById("eventTime")?.value,
        created: formatDateKeyLocal(new Date())
    };
    if (!calendarEvents[selectedDate]) calendarEvents[selectedDate] = [];
    calendarEvents[selectedDate].push(event);
    localStorage.setItem("hotelCalendarEvents", JSON.stringify(calendarEvents));
    closeEventModal();
    renderCalendar();
    renderDayEvents();
    renderEventList();
}

function deleteCalendarEvent(idx) {
    if (!selectedDate) return;
    calendarEvents[selectedDate].splice(idx, 1);
    if (calendarEvents[selectedDate].length === 0) delete calendarEvents[selectedDate];
    localStorage.setItem("hotelCalendarEvents", JSON.stringify(calendarEvents));
    renderCalendar();
    renderDayEvents();
    renderEventList();
}

// Inicializar calendario y lista de eventos al cargar DOM
document.addEventListener("DOMContentLoaded", () => {
    renderCalendar();
    const today = formatDateKeyLocal(new Date());
    selectDate(today, new Date());
    
   
});
