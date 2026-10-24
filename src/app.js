(() => {
  'use strict'

  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

  const STORAGE = {
    custom: 'xfinity-cam.concept.cameras.v1',
    access: 'xfinity-cam.concept.access.v1'
  }

  const defaultCameras = [
    {
      id: 'front',
      name: 'Front Door',
      group: 'Outdoor',
      scene: 'frontdoor',
      detail: '2K HDR · Strong signal',
      event: 'Person detected 2m ago'
    },
    {
      id: 'drive',
      name: 'Driveway',
      group: 'Outdoor',
      scene: 'driveway',
      detail: '1080p · Strong signal',
      event: 'Vehicle detected 14m ago'
    },
    {
      id: 'back',
      name: 'Backyard',
      group: 'Outdoor',
      scene: 'backyard',
      detail: '1080p · Fair signal',
      event: 'Pet detected 31m ago'
    },
    {
      id: 'living',
      name: 'Living Room',
      group: 'Indoor',
      scene: 'living',
      detail: '2K · Strong signal',
      event: 'All clear · 12m ago'
    },
    {
      id: 'nursery',
      name: 'Nursery',
      group: 'Indoor',
      scene: 'nursery',
      detail: '1080p · Strong signal',
      event: 'All clear · 26m ago'
    }
  ]

  const events = [
    { camera: 'Front Door', label: 'Person detected', icon: 'person', tone: '', time: '2m' },
    { camera: 'Driveway', label: 'Vehicle detected', icon: 'car', tone: 'amber', time: '14m' },
    { camera: 'Backyard', label: 'Pet detected', icon: 'motion', tone: 'green', time: '31m' },
    { camera: 'Front Door', label: 'Package delivered', icon: 'package', tone: 'amber', time: '1h' },
    { camera: 'Living Room', label: 'All clear', icon: 'shield', tone: 'green', time: '2h' },
    { camera: 'Nursery', label: 'Camera online', icon: 'wifi', tone: '', time: '3h' }
  ]

  const els = {
    cameraList: $('#cameraList'),
    cameraCount: $('#cameraCount'),
    activeName: $('#activeName'),
    activeMeta: $('#activeMeta'),
    feedTitle: $('#feedTitle'),
    feedSub: $('#feedSub'),
    feedClock: $('#feedClock'),
    liveBadge: $('#liveBadge'),
    liveLabel: $('#liveLabel'),
    mainCanvas: $('#mainCanvas'),
    mainVideo: $('#mainVideo'),
    mainImage: $('#mainImage'),
    gridFeed: $('#gridFeed'),
    feed: $('#feed'),
    pauseBtn: $('#pauseBtn'),
    muteBtn: $('#muteBtn'),
    nightBtn: $('#nightBtn'),
    fullBtn: $('#fullBtn'),
    gridBtn: $('#gridBtn'),
    snapshotBtn: $('#snapshotBtn'),
    eventsStrip: $('#eventsStrip'),
    eventList: $('#eventList'),
    miniGrid: $('#miniGrid'),
    accessCode: $('#accessCode'),
    toast: $('#toast'),
    cameraModal: $('#cameraModal'),
    cameraForm: $('#cameraForm')
  }

  const state = {
    cameras: [...defaultCameras],
    activeId: 'front',
    filter: 'all',
    paused: false,
    muted: true,
    night: false,
    grid: false,
    frozenAt: 0
  }

  const accessCode = (() => {
    try {
      const stored = localStorage.getItem(STORAGE.access)
      if (stored && /^XCF-\d{4}$/.test(stored)) return stored
      const code = `XCF-${String(Math.floor(1000 + Math.random() * 9000))}`
      localStorage.setItem(STORAGE.access, code)
      return code
    } catch {
      return `XCF-${String(Math.floor(1000 + Math.random() * 9000))}`
    }
  })()

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character])
  }

  function readCustomCameras() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.custom) || '[]')
      if (!Array.isArray(parsed)) return []
      return parsed.filter(camera =>
        camera &&
        typeof camera.id === 'string' &&
        typeof camera.name === 'string' &&
        ['Indoor', 'Outdoor'].includes(camera.group) &&
        typeof camera.scene === 'string'
      ).map(camera => ({
        id: camera.id,
        name: camera.name.slice(0, 40),
        group: camera.group,
        scene: SCENES[camera.scene] ? camera.scene : 'frontdoor',
        detail: typeof camera.detail === 'string' ? camera.detail : 'Remote stream · Added recently',
        event: typeof camera.event === 'string' ? camera.event : 'Camera added recently',
        streamUrl: typeof camera.streamUrl === 'string' && /^https?:\/\//i.test(camera.streamUrl) ? camera.streamUrl : '',
        custom: true
      }))
    } catch {
      return []
    }
  }

  function saveCustomCameras() {
    try {
      const custom = state.cameras.filter(camera => camera.custom).map(({ id, name, group, scene, detail, event, streamUrl }) => ({
        id, name, group, scene, detail, event, streamUrl
      }))
      localStorage.setItem(STORAGE.custom, JSON.stringify(custom))
    } catch {
      // Private browsing can reject storage; the session still works.
    }
  }

  function activeCamera() {
    return state.cameras.find(camera => camera.id === state.activeId) || state.cameras[0]
  }

  function showToast(message) {
    els.toast.textContent = message
    els.toast.classList.add('is-visible')
    clearTimeout(showToast.timer)
    showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2600)
  }

  function icon(name, className = 'icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`
  }

  /* ------------------------------------------------------------------ *
   * Canvas scenes
   * ------------------------------------------------------------------ */

  function linearGradient(ctx, x0, y0, x1, y1, stops) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    for (const [offset, color] of stops) gradient.addColorStop(offset, color)
    return gradient
  }

  function radialGlow(ctx, x, y, radius, stops) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    for (const [offset, color] of stops) gradient.addColorStop(offset, color)
    return gradient
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
  }

  function fillRounded(ctx, x, y, width, height, radius, fillStyle) {
    roundedRect(ctx, x, y, width, height, radius)
    ctx.fillStyle = fillStyle
    ctx.fill()
  }

  function seededRandom(seed) {
    let value = seed >>> 0
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0
      return value / 4294967296
    }
  }

  const starField = (() => {
    const random = seededRandom(8841)
    return Array.from({ length: 90 }, () => ({
      x: random() * 1280,
      y: random() * 330,
      r: 0.4 + random() * 1.3,
      phase: random() * Math.PI * 2
    }))
  })()

  function drawStars(ctx, t, maxY = 330, alpha = 0.65) {
    for (const star of starField) {
      if (star.y > maxY) continue
      const twinkle = 0.55 + 0.45 * Math.sin(t * 0.7 + star.phase)
      ctx.globalAlpha = alpha * twinkle
      ctx.fillStyle = '#dfe9ff'
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function drawTree(ctx, x, baseY, scale, color, t, phase = 0) {
    const sway = Math.sin(t * 0.55 + phase) * 2.2
    ctx.save()
    ctx.translate(x, baseY)
    ctx.scale(scale, scale)
    ctx.fillStyle = color
    ctx.fillRect(-7, -150, 14, 150)
    ctx.beginPath()
    ctx.ellipse(-34 + sway, -180, 54, 70, -0.28, 0, Math.PI * 2)
    ctx.ellipse(30 + sway, -192, 56, 76, 0.18, 0, Math.PI * 2)
    ctx.ellipse(0 + sway, -238, 64, 78, 0, 0, Math.PI * 2)
    ctx.ellipse(-8 + sway, -154, 45, 52, 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawBoundingBox(ctx, x, y, width, height, label, t, color = '#48d7ff') {
    const length = 14
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    ctx.setLineDash([9, 7])
    ctx.lineDashOffset = -t * 16
    ctx.globalAlpha = 0.62
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.lineWidth = 3.2
    ctx.beginPath()
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1],
      [x + width, y, -1, 1],
      [x, y + height, 1, -1],
      [x + width, y + height, -1, -1]
    ]) {
      ctx.moveTo(cx + dx * length, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + dy * length)
    }
    ctx.stroke()
    ctx.font = '650 16px Inter, system-ui, sans-serif'
    const textWidth = ctx.measureText(label).width
    fillRounded(ctx, x, y - 31, textWidth + 22, 23, 6, 'rgba(5, 12, 22, 0.72)')
    ctx.fillStyle = color
    ctx.fillText(label, x + 11, y - 14)
    ctx.restore()
  }

  function drawPerson(ctx, x, groundY, scale, t) {
    const sway = Math.sin(t * 1.6) * 2
    ctx.save()
    ctx.translate(x + sway, groundY)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#070b12'
    ctx.beginPath()
    ctx.arc(0, -176, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-20, -155)
    ctx.quadraticCurveTo(-33, -112, -24, -48)
    ctx.lineTo(23, -48)
    ctx.quadraticCurveTo(31, -112, 18, -155)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#070b12'
    ctx.beginPath()
    ctx.moveTo(-15, -140)
    ctx.lineTo(-34, -95)
    ctx.moveTo(15, -140)
    ctx.lineTo(36, -100)
    ctx.moveTo(-9, -48)
    ctx.lineTo(-16, 0)
    ctx.moveTo(11, -48)
    ctx.lineTo(19, 0)
    ctx.stroke()
    ctx.restore()
  }

  function drawCat(ctx, x, y, scale, t) {
    const wag = Math.sin(t * 2.2) * 8
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#0a0e16'
    ctx.beginPath()
    ctx.ellipse(0, -14, 26, 13, 0, 0, Math.PI * 2)
    ctx.arc(24, -28, 11, 0, Math.PI * 2)
    ctx.moveTo(18, -36)
    ctx.lineTo(19, -47)
    ctx.lineTo(27, -38)
    ctx.moveTo(30, -38)
    ctx.lineTo(36, -47)
    ctx.lineTo(36, -35)
    ctx.fill()
    ctx.strokeStyle = '#0a0e16'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-23, -14)
    ctx.quadraticCurveTo(-48, -16, -44 + wag, -42)
    ctx.stroke()
    ctx.restore()
  }

  function drawDog(ctx, x, y, scale, t) {
    const bob = Math.sin(t * 3) * 2
    ctx.save()
    ctx.translate(x, y + bob)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#0a0f18'
    ctx.beginPath()
    ctx.ellipse(0, -20, 32, 16, 0, 0, Math.PI * 2)
    ctx.arc(32, -36, 14, 0, Math.PI * 2)
    ctx.moveTo(22, -47)
    ctx.lineTo(19, -61)
    ctx.lineTo(32, -49)
    ctx.moveTo(40, -48)
    ctx.lineTo(48, -61)
    ctx.lineTo(48, -45)
    ctx.fill()
    ctx.strokeStyle = '#0a0f18'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-26, -18)
    ctx.lineTo(-18, 2)
    ctx.moveTo(-12, -18)
    ctx.lineTo(-4, 2)
    ctx.moveTo(16, -18)
    ctx.lineTo(24, 2)
    ctx.moveTo(26, -18)
    ctx.lineTo(34, 2)
    ctx.moveTo(-30, -28)
    ctx.quadraticCurveTo(-52, -38, -48, -58)
    ctx.stroke()
    ctx.restore()
  }

  function sceneFrontDoor(ctx, t) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, 720, [
      [0, '#050a17'],
      [0.48, '#0a1427'],
      [0.72, '#11203a'],
      [1, '#172a43']
    ])
    ctx.fillRect(0, 0, 1280, 720)
    drawStars(ctx, t, 320, 0.7)

    ctx.fillStyle = radialGlow(ctx, 1070, 105, 170, [
      [0, 'rgba(164, 188, 255, 0.22)'],
      [0.4, 'rgba(122, 151, 226, 0.08)'],
      [1, 'rgba(122, 151, 226, 0)']
    ])
    ctx.fillRect(880, 0, 380, 310)
    ctx.fillStyle = '#dbe6ff'
    ctx.beginPath()
    ctx.arc(1070, 105, 31, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(158, 178, 225, 0.28)'
    ctx.beginPath()
    ctx.arc(1081, 96, 8, 0, Math.PI * 2)
    ctx.arc(1058, 116, 5, 0, Math.PI * 2)
    ctx.fill()

    drawTree(ctx, 110, 620, 1.25, '#060d18', t, 1.2)
    drawTree(ctx, 260, 600, 0.92, '#070f1b', t, 2.8)

    ctx.fillStyle = linearGradient(ctx, 470, 140, 1280, 610, [
      [0, '#1a263c'],
      [0.55, '#111b2e'],
      [1, '#0b1322']
    ])
    ctx.fillRect(470, 140, 810, 470)
    ctx.fillStyle = '#0a101d'
    ctx.fillRect(455, 120, 825, 30)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)'
    ctx.lineWidth = 1
    for (let y = 174; y < 610; y += 25) {
      ctx.beginPath()
      ctx.moveTo(470, y)
      ctx.lineTo(1280, y)
      ctx.stroke()
    }

    ctx.fillStyle = radialGlow(ctx, 690, 215, 240, [
      [0, 'rgba(255, 188, 105, 0.28)'],
      [0.45, 'rgba(255, 177, 91, 0.08)'],
      [1, 'rgba(255, 177, 91, 0)']
    ])
    ctx.fillRect(450, 0, 480, 500)

    ctx.fillStyle = '#111927'
    roundedRect(ctx, 665, 214, 50, 18, 5)
    ctx.fill()
    ctx.fillStyle = '#ffd7a0'
    roundedRect(ctx, 669, 229, 42, 9, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 220, 160, 0.9)'
    ctx.beginPath()
    ctx.arc(690, 249, 7, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#0a121e'
    roundedRect(ctx, 828, 218, 214, 362, 8)
    ctx.fill()
    ctx.fillStyle = linearGradient(ctx, 844, 232, 1028, 568, [
      [0, '#244a50'],
      [0.5, '#173840'],
      [1, '#102a32']
    ])
    roundedRect(ctx, 844, 232, 184, 338, 5)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.lineWidth = 2
    roundedRect(ctx, 864, 254, 144, 106, 4)
    ctx.stroke()
    roundedRect(ctx, 864, 382, 144, 76, 4)
    ctx.stroke()
    roundedRect(ctx, 864, 478, 144, 72, 4)
    ctx.stroke()
    ctx.fillStyle = '#d5af68'
    ctx.beginPath()
    ctx.arc(1007, 410, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#08131b'
    roundedRect(ctx, 1088, 252, 144, 166, 5)
    ctx.fill()
    ctx.fillStyle = linearGradient(ctx, 1094, 258, 1226, 412, [
      [0, 'rgba(255, 200, 126, 0.72)'],
      [1, 'rgba(208, 139, 69, 0.22)']
    ])
    roundedRect(ctx, 1094, 258, 132, 154, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(9, 17, 27, 0.86)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(1160, 258)
    ctx.lineTo(1160, 412)
    ctx.moveTo(1094, 334)
    ctx.lineTo(1226, 334)
    ctx.stroke()

    ctx.fillStyle = '#060c16'
    ctx.beginPath()
    ctx.moveTo(440, 640)
    ctx.lineTo(790, 640)
    ctx.lineTo(742, 540)
    ctx.lineTo(488, 540)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#0e1724'
    ctx.beginPath()
    ctx.moveTo(470, 720)
    ctx.lineTo(800, 720)
    ctx.lineTo(764, 628)
    ctx.lineTo(520, 628)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
    ctx.lineWidth = 2
    for (let y = 652; y < 720; y += 24) {
      ctx.beginPath()
      ctx.moveTo(505 - (y - 628) * 0.25, y)
      ctx.lineTo(770 + (y - 628) * 0.16, y)
      ctx.stroke()
    }

    const plantSway = Math.sin(t * 1.1) * 3
    for (const [px, py, scale] of [[790, 596, 1], [1066, 596, 0.86]]) {
      ctx.fillStyle = '#0b1b20'
      ctx.beginPath()
      ctx.moveTo(px - 22, py)
      ctx.lineTo(px + 22, py)
      ctx.lineTo(px + 15, py + 36)
      ctx.lineTo(px - 15, py + 36)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#163f37'
      for (let index = 0; index < 7; index += 1) {
        const angle = -1.9 + index * 0.36
        ctx.beginPath()
        ctx.ellipse(
          px + Math.cos(angle) * 18 + plantSway,
          py - 20 + Math.sin(angle) * 26,
          10,
          27,
          angle + 0.4,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
    }

    ctx.fillStyle = '#8a633d'
    roundedRect(ctx, 724, 592, 54, 40, 3)
    ctx.fill()
    ctx.fillStyle = '#b98a55'
    roundedRect(ctx, 724, 592, 54, 8, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(70, 43, 22, 0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(742, 592)
    ctx.lineTo(742, 628)
    ctx.moveTo(760, 592)
    ctx.lineTo(760, 628)
    ctx.stroke()

    const personX = 610 + Math.sin(t * 0.7) * 4
    drawPerson(ctx, personX, 658, 0.98, t)
    drawBoundingBox(ctx, personX - 46, 448, 94, 216, 'PERSON · 98%', t)
    drawCat(ctx, 890 + Math.sin(t * 0.6) * 5, 638, 0.72, t)

    ctx.fillStyle = radialGlow(ctx, 690, 260, 290, [
      [0, 'rgba(255, 205, 140, 0.11)'],
      [1, 'rgba(255, 205, 140, 0)']
    ])
    ctx.fillRect(390, 240, 600, 470)

    ctx.fillStyle = 'rgba(3, 7, 14, 0.22)'
    ctx.fillRect(0, 0, 1280, 720)
  }

  function sceneDriveway(ctx, t) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, 720, [
      [0, '#070f1e'],
      [0.44, '#15253b'],
      [0.66, '#35465c'],
      [1, '#1a2431']
    ])
    ctx.fillRect(0, 0, 1280, 720)
    drawStars(ctx, t, 240, 0.45)

    ctx.fillStyle = radialGlow(ctx, 1060, 118, 260, [
      [0, 'rgba(180, 197, 232, 0.16)'],
      [1, 'rgba(180, 197, 232, 0)']
    ])
    ctx.fillRect(780, 0, 500, 360)

    ctx.fillStyle = 'rgba(166, 185, 219, 0.09)'
    for (const [x, y, rx, ry] of [[270, 130, 150, 24], [470, 170, 205, 18], [880, 92, 180, 20]]) {
      ctx.beginPath()
      ctx.ellipse(x + Math.sin(t * 0.08 + x) * 8, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    drawTree(ctx, 120, 600, 1.45, '#060d17', t, 0.6)
    drawTree(ctx, 310, 590, 1.05, '#070e19', t, 1.8)
    drawTree(ctx, 470, 585, 0.8, '#08101b', t, 3.1)

    ctx.fillStyle = linearGradient(ctx, 780, 220, 1280, 610, [
      [0, '#202d43'],
      [1, '#0e1828']
    ])
    ctx.fillRect(760, 218, 520, 390)
    ctx.fillStyle = '#0a1321'
    ctx.beginPath()
    ctx.moveTo(742, 218)
    ctx.lineTo(1280, 178)
    ctx.lineTo(1280, 235)
    ctx.lineTo(752, 264)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#0a121e'
    roundedRect(ctx, 822, 294, 394, 264, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)'
    ctx.lineWidth = 2
    for (let y = 318; y < 550; y += 28) {
      ctx.beginPath()
      ctx.moveTo(834, y)
      ctx.lineTo(1204, y)
      ctx.stroke()
    }
    ctx.fillStyle = radialGlow(ctx, 1018, 266, 190, [
      [0, 'rgba(255, 210, 150, 0.3)'],
      [1, 'rgba(255, 210, 150, 0)']
    ])
    ctx.fillRect(830, 170, 380, 230)
    ctx.fillStyle = '#f7d6a0'
    roundedRect(ctx, 998, 258, 42, 10, 4)
    ctx.fill()

    ctx.fillStyle = linearGradient(ctx, 430, 520, 850, 720, [
      [0, '#252b34'],
      [0.5, '#1a2029'],
      [1, '#131923']
    ])
    ctx.beginPath()
    ctx.moveTo(414, 720)
    ctx.lineTo(890, 720)
    ctx.lineTo(850, 548)
    ctx.lineTo(522, 548)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
    ctx.lineWidth = 2
    for (let index = 0; index < 5; index += 1) {
      const offset = index * 26
      ctx.beginPath()
      ctx.moveTo(500 + offset, 720)
      ctx.lineTo(648 + offset * 0.4, 548)
      ctx.stroke()
    }

    ctx.fillStyle = radialGlow(ctx, 210, 430, 250, [
      [0, 'rgba(255, 196, 116, 0.3)'],
      [0.4, 'rgba(255, 182, 90, 0.09)'],
      [1, 'rgba(255, 182, 90, 0)']
    ])
    ctx.fillRect(0, 200, 500, 520)
    ctx.strokeStyle = '#0a111b'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.moveTo(198, 620)
    ctx.lineTo(198, 330)
    ctx.quadraticCurveTo(198, 305, 228, 305)
    ctx.stroke()
    ctx.fillStyle = '#ffd795'
    roundedRect(ctx, 214, 303, 44, 18, 8)
    ctx.fill()

    const carTone = linearGradient(ctx, 360, 445, 690, 585, [
      [0, '#3b465a'],
      [0.5, '#222b3b'],
      [1, '#101722']
    ])
    ctx.fillStyle = carTone
    roundedRect(ctx, 352, 470, 352, 78, 20)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(424, 472)
    ctx.quadraticCurveTo(460, 412, 540, 404)
    ctx.lineTo(608, 404)
    ctx.quadraticCurveTo(660, 418, 684, 472)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#0a1422'
    ctx.beginPath()
    ctx.moveTo(450, 466)
    ctx.quadraticCurveTo(474, 426, 534, 420)
    ctx.lineTo(586, 420)
    ctx.quadraticCurveTo(626, 428, 646, 466)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(109, 165, 207, 0.21)'
    ctx.beginPath()
    ctx.moveTo(458, 460)
    ctx.quadraticCurveTo(480, 430, 528, 425)
    ctx.lineTo(528, 460)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#080e17'
    for (const wheelX of [414, 642]) {
      ctx.beginPath()
      ctx.arc(wheelX, 550, 30, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#273242'
      ctx.beginPath()
      ctx.arc(wheelX, 550, 13, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#080e17'
    }
    ctx.fillStyle = 'rgba(255, 208, 138, 0.82)'
    roundedRect(ctx, 674, 492, 28, 13, 6)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 96, 127, 0.55)'
    roundedRect(ctx, 354, 492, 17, 10, 5)
    ctx.fill()
    ctx.fillStyle = 'rgba(188, 213, 255, 0.22)'
    roundedRect(ctx, 680, 478, 8, 44, 4)
    ctx.fill()

    drawBoundingBox(ctx, 340, 390, 368, 200, 'VEHICLE · 96%', t, '#ffbf5e')

    ctx.strokeStyle = '#0a111b'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(780, 610)
    ctx.lineTo(780, 532)
    ctx.stroke()
    ctx.fillStyle = '#223044'
    roundedRect(ctx, 748, 500, 64, 38, 4)
    ctx.fill()
    ctx.fillStyle = '#ffbf5e'
    ctx.fillRect(756, 510, 20, 3)

    ctx.fillStyle = 'rgba(4, 8, 15, 0.16)'
    ctx.fillRect(0, 0, 1280, 720)
  }

  function sceneBackyard(ctx, t) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, 720, [
      [0, '#101c31'],
      [0.4, '#26364e'],
      [0.67, '#65536a'],
      [0.82, '#3a4453'],
      [1, '#1b2a28']
    ])
    ctx.fillRect(0, 0, 1280, 720)

    ctx.fillStyle = radialGlow(ctx, 1010, 160, 310, [
      [0, 'rgba(255, 184, 126, 0.26)'],
      [1, 'rgba(255, 184, 126, 0)']
    ])
    ctx.fillRect(690, 0, 590, 430)
    ctx.fillStyle = '#ffd9ad'
    ctx.beginPath()
    ctx.arc(1010, 160, 24, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(154, 177, 210, 0.08)'
    for (const [x, y, rx, ry] of [[220, 150, 180, 21], [520, 105, 220, 16], [800, 180, 180, 19]]) {
      ctx.beginPath()
      ctx.ellipse(x + Math.sin(t * 0.07 + x) * 10, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = '#1a2520'
    ctx.fillRect(0, 388, 1280, 332)
    ctx.fillStyle = linearGradient(ctx, 0, 388, 0, 720, [
      [0, '#29382c'],
      [0.5, '#1c2c24'],
      [1, '#111f1b']
    ])
    ctx.fillRect(0, 470, 1280, 250)

    ctx.fillStyle = '#40382d'
    ctx.fillRect(0, 368, 1280, 64)
    ctx.fillStyle = '#2b251e'
    for (let x = 24; x < 1280; x += 54) {
      ctx.fillRect(x, 330, 7, 100)
    }
    ctx.fillStyle = '#5a4c3a'
    ctx.fillRect(0, 360, 1280, 8)

    drawTree(ctx, 132, 560, 1.35, '#0b1712', t, 0.9)
    drawTree(ctx, 310, 520, 0.82, '#0c1914', t, 2.4)

    ctx.fillStyle = linearGradient(ctx, 740, 430, 1180, 690, [
      [0, '#2e7f9e'],
      [0.45, '#1b607d'],
      [1, '#123f5b']
    ])
    ctx.beginPath()
    ctx.moveTo(760, 460)
    ctx.lineTo(1190, 438)
    ctx.lineTo(1240, 676)
    ctx.lineTo(714, 690)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(145, 229, 255, 0.3)'
    ctx.lineWidth = 2
    for (let index = 0; index < 6; index += 1) {
      const offset = (index * 22 + t * 7) % 70
      ctx.beginPath()
      ctx.moveTo(788 + index * 61, 496 + offset)
      ctx.quadraticCurveTo(820 + index * 61, 508 + offset, 850 + index * 61, 496 + offset)
      ctx.stroke()
    }
    ctx.fillStyle = '#27332a'
    ctx.beginPath()
    ctx.moveTo(712, 690)
    ctx.lineTo(1240, 676)
    ctx.lineTo(1240, 708)
    ctx.lineTo(690, 720)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#3a3a36'
    ctx.fillRect(250, 570, 390, 20)
    ctx.fillStyle = '#4b4a43'
    ctx.fillRect(268, 590, 354, 12)
    ctx.fillStyle = '#1f2723'
    roundedRect(ctx, 292, 490, 96, 88, 8)
    ctx.fill()
    ctx.fillStyle = '#2b3430'
    roundedRect(ctx, 310, 500, 60, 52, 6)
    ctx.fill()
    ctx.fillStyle = '#1d2521'
    roundedRect(ctx, 452, 486, 80, 92, 8)
    ctx.fill()
    ctx.strokeStyle = '#3f4942'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(468, 520)
    ctx.lineTo(516, 520)
    ctx.moveTo(492, 500)
    ctx.lineTo(492, 560)
    ctx.stroke()

    ctx.fillStyle = '#2d2a26'
    ctx.beginPath()
    ctx.arc(640, 574, 42, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff8f52'
    ctx.beginPath()
    ctx.arc(640, 580, 13 + Math.sin(t * 4) * 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = radialGlow(ctx, 640, 574, 120, [
      [0, 'rgba(255, 131, 68, 0.28)'],
      [1, 'rgba(255, 131, 68, 0)']
    ])
    ctx.fillRect(500, 440, 280, 220)

    ctx.strokeStyle = 'rgba(255, 208, 144, 0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(70, 120)
    ctx.quadraticCurveTo(620, 248, 1210, 132)
    ctx.stroke()
    for (let index = 0; index <= 14; index += 1) {
      const p = index / 14
      const x = 70 + (1210 - 70) * p
      const y = (1 - p) * (1 - p) * 120 + 2 * (1 - p) * p * 248 + p * p * 132
      const flicker = 0.7 + Math.sin(t * 2 + index) * 0.3
      ctx.globalAlpha = flicker
      ctx.fillStyle = '#ffd79a'
      ctx.beginPath()
      ctx.arc(x, y + 9, 3.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    const dogX = 390 + Math.sin(t * 0.45) * 34
    drawDog(ctx, dogX, 636, 0.86, t)
    drawBoundingBox(ctx, dogX - 50, 558, 112, 94, 'PET · 94%', t, '#35e0a1')

    ctx.fillStyle = 'rgba(5, 10, 14, 0.16)'
    ctx.fillRect(0, 0, 1280, 720)
  }

  function sceneLiving(ctx, t) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, 720, [
      [0, '#1b1b28'],
      [0.55, '#27212b'],
      [1, '#17141c']
    ])
    ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = linearGradient(ctx, 0, 530, 0, 720, [
      [0, '#2e2529'],
      [1, '#171217']
    ])
    ctx.fillRect(0, 520, 1280, 200)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
    for (let x = 0; x < 1280; x += 96) ctx.fillRect(x, 520, 1, 200)
    for (let y = 554; y < 720; y += 38) ctx.fillRect(0, y, 1280, 1)

    ctx.fillStyle = linearGradient(ctx, 890, 110, 1220, 430, [
      [0, '#071424'],
      [1, '#0f2438']
    ])
    ctx.fillRect(890, 112, 320, 308)
    ctx.fillStyle = radialGlow(ctx, 1090, 174, 150, [
      [0, 'rgba(155, 190, 255, 0.28)'],
      [1, 'rgba(155, 190, 255, 0)']
    ])
    ctx.fillRect(890, 80, 320, 250)
    ctx.fillStyle = '#d4e2ff'
    ctx.beginPath()
    ctx.arc(1084, 180, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#18212d'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(1050, 112)
    ctx.lineTo(1050, 420)
    ctx.stroke()
    ctx.fillStyle = 'rgba(35, 24, 34, 0.86)'
    ctx.beginPath()
    ctx.moveTo(890, 112)
    ctx.quadraticCurveTo(934, 190, 902, 300)
    ctx.lineTo(890, 420)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(1210, 112)
    ctx.quadraticCurveTo(1170, 190, 1202, 300)
    ctx.lineTo(1210, 420)
    ctx.closePath()
    ctx.fill()

    const tvGlow = 0.7 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 8.7) * 0.03
    ctx.fillStyle = radialGlow(ctx, 240, 330, 330, [
      [0, `rgba(66, 139, 255, ${0.25 * tvGlow})`],
      [1, 'rgba(66, 139, 255, 0)']
    ])
    ctx.fillRect(0, 90, 620, 560)
    ctx.fillStyle = '#0a0d13'
    roundedRect(ctx, 76, 218, 304, 178, 7)
    ctx.fill()
    ctx.fillStyle = linearGradient(ctx, 90, 230, 366, 386, [
      [0, `rgba(62, 134, 255, ${0.58 * tvGlow})`],
      [1, `rgba(16, 48, 135, ${0.46 * tvGlow})`]
    ])
    roundedRect(ctx, 90, 230, 276, 154, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(198, 221, 255, 0.18)'
    ctx.beginPath()
    ctx.moveTo(120, 230)
    ctx.lineTo(220, 230)
    ctx.lineTo(150, 384)
    ctx.lineTo(90, 384)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#1d2d38'
    roundedRect(ctx, 252, 412, 478, 160, 26)
    ctx.fill()
    ctx.fillStyle = '#28414d'
    roundedRect(ctx, 272, 388, 438, 118, 24)
    ctx.fill()
    ctx.fillStyle = '#223942'
    roundedRect(ctx, 292, 414, 186, 92, 18)
    ctx.fill()
    roundedRect(ctx, 494, 414, 194, 92, 18)
    ctx.fill()
    ctx.fillStyle = '#35545e'
    roundedRect(ctx, 304, 424, 162, 70, 13)
    ctx.fill()
    roundedRect(ctx, 506, 424, 170, 70, 13)
    ctx.fill()
    ctx.fillStyle = '#17242b'
    roundedRect(ctx, 282, 540, 18, 34, 4)
    ctx.fill()
    roundedRect(ctx, 682, 540, 18, 34, 4)
    ctx.fill()
    ctx.fillStyle = '#33301f'
    roundedRect(ctx, 308, 512, 70, 42, 6)
    ctx.fill()
    ctx.fillStyle = '#4b4630'
    roundedRect(ctx, 318, 518, 50, 28, 4)
    ctx.fill()

    const catTail = Math.sin(t * 1.7) * 5
    ctx.fillStyle = '#0d1017'
    ctx.beginPath()
    ctx.ellipse(584, 448, 38, 18, 0, 0, Math.PI * 2)
    ctx.arc(620, 431, 14, 0, Math.PI * 2)
    ctx.moveTo(612, 421)
    ctx.lineTo(614, 406)
    ctx.lineTo(624, 421)
    ctx.moveTo(626, 421)
    ctx.lineTo(634, 407)
    ctx.lineTo(634, 423)
    ctx.fill()
    ctx.strokeStyle = '#0d1017'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(550, 446)
    ctx.quadraticCurveTo(524, 446, 528 + catTail, 420)
    ctx.stroke()

    ctx.fillStyle = radialGlow(ctx, 790, 334, 240, [
      [0, 'rgba(255, 186, 104, 0.3)'],
      [0.5, 'rgba(255, 186, 104, 0.08)'],
      [1, 'rgba(255, 186, 104, 0)']
    ])
    ctx.fillRect(540, 60, 500, 560)
    ctx.fillStyle = '#26202a'
    ctx.beginPath()
    ctx.moveTo(782, 570)
    ctx.lineTo(806, 570)
    ctx.lineTo(802, 454)
    ctx.lineTo(786, 454)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f3c688'
    ctx.beginPath()
    ctx.moveTo(768, 454)
    ctx.lineTo(820, 454)
    ctx.lineTo(806, 414)
    ctx.lineTo(782, 414)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#24342c'
    ctx.beginPath()
    ctx.moveTo(856, 590)
    ctx.lineTo(884, 590)
    ctx.lineTo(878, 548)
    ctx.lineTo(862, 548)
    ctx.closePath()
    ctx.fill()
    for (let index = 0; index < 8; index += 1) {
      const angle = -2.2 + index * 0.55
      ctx.fillStyle = index % 2 ? '#305b45' : '#244b38'
      ctx.beginPath()
      ctx.ellipse(
        870 + Math.cos(angle) * 26,
        520 + Math.sin(angle) * 36,
        15,
        38,
        angle,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
    ctx.beginPath()
    ctx.ellipse(500, 648, 286, 52, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(500, 648, 210, 34, 0, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)'
    ctx.fillRect(438, 204, 112, 76)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.strokeRect(438, 204, 112, 76)
    ctx.fillStyle = 'rgba(160, 140, 190, 0.2)'
    ctx.beginPath()
    ctx.arc(494, 242, 20, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = '650 15px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(53, 224, 161, 0.8)'
    fillRounded(ctx, 44, 654, 118, 28, 6, 'rgba(6, 22, 16, 0.6)')
    ctx.fillStyle = '#7ff0c8'
    ctx.fillText('ALL CLEAR', 60, 673)
    ctx.fillStyle = 'rgba(3, 6, 11, 0.2)'
    ctx.fillRect(0, 0, 1280, 720)
  }

  function sceneNursery(ctx, t) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, 720, [
      [0, '#171d31'],
      [0.55, '#222943'],
      [1, '#141a2c']
    ])
    ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = linearGradient(ctx, 0, 540, 0, 720, [
      [0, '#293047'],
      [1, '#161b2b']
    ])
    ctx.fillRect(0, 530, 1280, 190)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.028)'
    for (let x = 0; x < 1280; x += 88) ctx.fillRect(x, 530, 1, 190)

    ctx.fillStyle = linearGradient(ctx, 92, 126, 372, 402, [
      [0, '#071329'],
      [1, '#122a4a']
    ])
    ctx.fillRect(92, 126, 280, 276)
    ctx.fillStyle = radialGlow(ctx, 246, 178, 140, [
      [0, 'rgba(176, 199, 255, 0.28)'],
      [1, 'rgba(176, 199, 255, 0)']
    ])
    ctx.fillRect(92, 80, 280, 250)
    ctx.fillStyle = '#dae5ff'
    ctx.beginPath()
    ctx.arc(236, 184, 21, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(223, 233, 255, 0.8)'
    for (const [x, y, r] of [[142, 168, 1.4], [168, 218, 1], [304, 164, 1.2], [326, 244, 0.9], [196, 268, 1.1]]) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#1c2537'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(232, 126)
    ctx.lineTo(232, 402)
    ctx.moveTo(92, 264)
    ctx.lineTo(372, 264)
    ctx.stroke()

    const twinkle = 0.55 + Math.sin(t * 1.2) * 0.25
    ctx.globalAlpha = twinkle
    for (const [x, y, r] of [[520, 130, 2.2], [610, 196, 1.5], [704, 146, 2.6], [816, 214, 1.8], [480, 260, 1.4], [932, 130, 1.9]]) {
      ctx.fillStyle = '#b6c9ff'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    ctx.fillStyle = '#d7dbe8'
    ctx.fillRect(686, 330, 414, 22)
    ctx.fillRect(678, 352, 430, 16)
    ctx.fillStyle = '#aeb6c9'
    for (let x = 692; x < 1090; x += 26) ctx.fillRect(x, 368, 7, 184)
    ctx.fillStyle = '#e3e6ef'
    roundedRect(ctx, 704, 536, 380, 56, 8)
    ctx.fill()
    ctx.fillStyle = '#c8cedd'
    roundedRect(ctx, 738, 380, 314, 148, 8)
    ctx.fill()
    ctx.fillStyle = '#eef0f6'
    roundedRect(ctx, 748, 390, 294, 126, 6)
    ctx.fill()
    ctx.fillStyle = '#9ca8c4'
    ctx.beginPath()
    ctx.moveTo(748, 468)
    ctx.quadraticCurveTo(895, 438, 1042, 468)
    ctx.lineTo(1042, 516)
    ctx.lineTo(748, 516)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c3cbe0'
    ctx.beginPath()
    ctx.arc(895, 448, 25, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#6f7b96'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(886, 330)
    ctx.lineTo(886, 226)
    ctx.stroke()
    ctx.fillStyle = '#8e96ad'
    ctx.beginPath()
    ctx.arc(886, 222, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(196, 207, 232, 0.6)'
    ctx.lineWidth = 1.5
    for (const [x, length, phase] of [[846, 42, 0.4], [886, 64, 1.3], [926, 48, 2.2]]) {
      ctx.beginPath()
      ctx.moveTo(886, 226)
      ctx.lineTo(x, 226 + length)
      ctx.stroke()
      ctx.fillStyle = '#ffd9a2'
      ctx.beginPath()
      ctx.arc(x, 226 + length + 5 + Math.sin(t * 1.1 + phase) * 3, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = '#5a4b45'
    ctx.beginPath()
    ctx.moveTo(560, 558)
    ctx.lineTo(646, 558)
    ctx.lineTo(632, 604)
    ctx.lineTo(574, 604)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#6c5a52'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(546, 560)
    ctx.lineTo(660, 560)
    ctx.stroke()
    ctx.strokeStyle = '#453b39'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(566, 604)
    ctx.lineTo(556, 686)
    ctx.moveTo(640, 604)
    ctx.lineTo(650, 686)
    ctx.stroke()
    ctx.strokeStyle = '#5a4b45'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(560, 478)
    ctx.quadraticCurveTo(522, 508, 536, 556)
    ctx.moveTo(646, 478)
    ctx.quadraticCurveTo(684, 508, 670, 556)
    ctx.stroke()

    ctx.fillStyle = radialGlow(ctx, 190, 636, 220, [
      [0, 'rgba(255, 204, 124, 0.34)'],
      [0.5, 'rgba(255, 204, 124, 0.1)'],
      [1, 'rgba(255, 204, 124, 0)']
    ])
    ctx.fillRect(0, 440, 430, 280)
    ctx.fillStyle = '#f5d2a0'
    ctx.beginPath()
    ctx.arc(182, 650, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2b3347'
    ctx.beginPath()
    ctx.ellipse(182, 688, 43, 12, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
    ctx.beginPath()
    ctx.ellipse(560, 664, 270, 44, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(185, 198, 235, 0.12)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(560, 664, 192, 28, 0, 0, Math.PI * 2)
    ctx.stroke()

    fillRounded(ctx, 44, 654, 118, 28, 6, 'rgba(6, 22, 16, 0.6)')
    ctx.font = '650 15px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#7ff0c8'
    ctx.fillText('ALL CLEAR', 60, 673)
    ctx.fillStyle = 'rgba(3, 6, 11, 0.22)'
    ctx.fillRect(0, 0, 1280, 720)
  }

  const SCENES = {
    frontdoor: sceneFrontDoor,
    driveway: sceneDriveway,
    backyard: sceneBackyard,
    living: sceneLiving,
    nursery: sceneNursery
  }

  function paintCanvas(canvas, sceneName, time) {
    const context = canvas.getContext('2d')
    if (!context) return
    const width = canvas.width
    const height = canvas.height
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.scale(width / 1280, height / 720)
    const draw = SCENES[sceneName] || SCENES.frontdoor
    draw(context, time)
    context.restore()
  }

  function paintStaticCanvas(canvas) {
    paintCanvas(canvas, canvas.dataset.scene || 'frontdoor', 0.6)
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function filteredCameras() {
    if (state.filter === 'all') return state.cameras
    return state.cameras.filter(camera => camera.group === state.filter)
  }

  function renderCameraList() {
    const cameras = filteredCameras()
    if (!cameras.length) {
      els.cameraList.innerHTML = '<div class="camera-empty">No cameras in this group yet.</div>'
    } else {
      els.cameraList.innerHTML = cameras.map(camera => `
        <button class="camera-card${camera.id === state.activeId ? ' is-active' : ''}" type="button"
          data-camera="${escapeHtml(camera.id)}" aria-pressed="${camera.id === state.activeId}">
          <span class="camera-thumb">
            <span class="mini-live"></span>
            <canvas width="160" height="90" data-scene="${escapeHtml(camera.scene)}" data-static="true"
              aria-label="${escapeHtml(camera.name)} thumbnail"></canvas>
          </span>
          <span class="camera-copy">
            <strong>${escapeHtml(camera.name)}</strong>
            <span>${escapeHtml(camera.detail)}</span>
            <span class="camera-state">${camera.streamUrl ? 'Streaming' : 'Online'}</span>
          </span>
          ${icon('chevron', 'icon chevron')}
        </button>
      `).join('')
    }
    els.cameraCount.textContent = `${state.cameras.length} connected`
    $$('canvas[data-static]').forEach(paintStaticCanvas)
  }

  function renderMiniGrid() {
    els.miniGrid.innerHTML = state.cameras.map(camera => `
      <button class="mini-card${camera.id === state.activeId ? ' is-active' : ''}" type="button"
        data-mini="${escapeHtml(camera.id)}" aria-label="View ${escapeHtml(camera.name)}">
        <canvas width="220" height="138" data-scene="${escapeHtml(camera.scene)}" data-static="true"></canvas>
        <span>${escapeHtml(camera.name)}</span>
        <span class="mini-live-dot"></span>
      </button>
    `).join('')
    $$('canvas[data-static]', els.miniGrid).forEach(paintStaticCanvas)
  }

  function eventIcon(event) {
    return `<span class="event-icon ${event.tone}">${icon(event.icon)}</span>`
  }

  function renderEvents() {
    els.eventsStrip.innerHTML = events.slice(0, 4).map(event => `
      <article class="event-card">
        ${eventIcon(event)}
        <div class="event-copy">
          <strong>${escapeHtml(event.label)}</strong>
          <span>${escapeHtml(event.camera)} · ${escapeHtml(event.time)} ago</span>
        </div>
      </article>
    `).join('')

    els.eventList.innerHTML = events.slice(0, 6).map(event => `
      <div class="event-row">
        ${eventIcon(event)}
        <div class="event-copy">
          <strong>${escapeHtml(event.label)}</strong>
          <span>${escapeHtml(event.camera)}</span>
        </div>
        <span class="event-time">${escapeHtml(event.time)}</span>
      </div>
    `).join('')
  }

  function streamKind(url) {
    try {
      const pathname = new URL(url).pathname.toLowerCase()
      if (/\.(png|jpe?g|webp|gif|avif)$/.test(pathname)) return 'image'
      return 'video'
    } catch {
      return null
    }
  }

  function updateMediaVisibility() {
    const camera = activeCamera()
    const kind = camera.streamUrl ? streamKind(camera.streamUrl) : null
    const showGrid = state.grid
    els.gridFeed.hidden = !showGrid
    els.mainCanvas.hidden = showGrid || Boolean(kind)
    els.mainVideo.hidden = showGrid || kind !== 'video'
    els.mainImage.hidden = showGrid || kind !== 'image'

    if (!kind || showGrid) {
      els.mainVideo.pause()
      return
    }
    if (kind === 'image') {
      if (els.mainImage.getAttribute('src') !== camera.streamUrl) els.mainImage.src = camera.streamUrl
      return
    }
    if (els.mainVideo.getAttribute('src') !== camera.streamUrl) {
      els.mainVideo.src = camera.streamUrl
      els.mainVideo.load()
    }
    els.mainVideo.muted = state.muted
    if (!state.paused) els.mainVideo.play().catch(() => {
      if (state.activeId === camera.id) showToast('Stream unavailable — showing simulated preview.')
      els.mainVideo.hidden = true
      els.mainCanvas.hidden = false
      els.mainVideo.removeAttribute('src')
      els.mainVideo.load()
    })
  }

  function renderGrid() {
    if (!state.grid) {
      els.gridFeed.innerHTML = ''
      return
    }
    els.gridFeed.innerHTML = state.cameras.map(camera => `
      <div class="grid-tile">
        <canvas width="640" height="360" data-grid-scene="${escapeHtml(camera.scene)}" data-grid-camera="${escapeHtml(camera.id)}"></canvas>
        <span>${escapeHtml(camera.name)}</span>
      </div>
    `).join('')
    $$('canvas[data-grid-scene]', els.gridFeed).forEach(canvas => {
      paintCanvas(canvas, canvas.dataset.gridScene, state.frozenAt || 0.5)
    })
  }

  function renderActive() {
    const camera = activeCamera()
    els.activeName.textContent = camera.name
    els.activeMeta.textContent = `${camera.group} · ${camera.detail}`
    els.feedTitle.textContent = camera.name
    els.feedSub.textContent = camera.event
    els.mainCanvas.setAttribute('aria-label', `Live ${camera.name} camera feed`)
    els.gridBtn.setAttribute('aria-pressed', String(state.grid))
    els.gridBtn.querySelector('span').textContent = state.grid ? 'Single view' : 'Grid view'
    els.gridBtn.classList.toggle('is-active', state.grid)

    $$('[data-camera]').forEach(card => {
      const active = card.dataset.camera === camera.id
      card.classList.toggle('is-active', active)
      card.setAttribute('aria-pressed', String(active))
    })
    $$('[data-mini]').forEach(card => {
      card.classList.toggle('is-active', card.dataset.mini === camera.id)
    })

    if (!state.paused && !state.grid) paintCanvas(els.mainCanvas, camera.scene, performance.now() / 1000)
    updateMediaVisibility()
  }

  function selectCamera(id) {
    if (!state.cameras.some(camera => camera.id === id)) return
    state.activeId = id
    renderActive()
  }

  /* ------------------------------------------------------------------ *
   * Interactions
   * ------------------------------------------------------------------ */

  els.cameraList.addEventListener('click', event => {
    const card = event.target.closest('[data-camera]')
    if (card) selectCamera(card.dataset.camera)
  })

  els.miniGrid.addEventListener('click', event => {
    const card = event.target.closest('[data-mini]')
    if (card) selectCamera(card.dataset.mini)
  })

  $$('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter
      $$('[data-filter]').forEach(item => {
        const active = item === button
        item.classList.toggle('is-active', active)
        item.setAttribute('aria-selected', String(active))
      })
      renderCameraList()
    })
  })

  els.pauseBtn.addEventListener('click', () => {
    state.paused = !state.paused
    state.frozenAt = performance.now() / 1000
    els.pauseBtn.innerHTML = icon(state.paused ? 'play' : 'pause')
    els.pauseBtn.setAttribute('aria-label', state.paused ? 'Resume live view' : 'Pause live view')
    els.pauseBtn.classList.toggle('is-active', state.paused)
    els.liveBadge.classList.toggle('is-paused', state.paused)
    els.liveLabel.textContent = state.paused ? 'PAUSED' : 'LIVE'
    if (state.paused) els.mainVideo.pause()
    else {
      updateMediaVisibility()
      showToast('Live view resumed.')
      return
    }
    showToast('Live view paused.')
  })

  els.muteBtn.addEventListener('click', () => {
    state.muted = !state.muted
    els.mainVideo.muted = state.muted
    els.muteBtn.innerHTML = icon(state.muted ? 'mute' : 'volume')
    els.muteBtn.setAttribute('aria-label', state.muted ? 'Unmute audio' : 'Mute audio')
    els.muteBtn.classList.toggle('is-active', !state.muted)
    showToast(state.muted ? 'Audio muted.' : 'Audio on.')
  })

  els.nightBtn.addEventListener('click', () => {
    state.night = !state.night
    els.feed.classList.toggle('night', state.night)
    els.nightBtn.classList.toggle('is-active', state.night)
    showToast(state.night ? 'Night vision enabled.' : 'Night vision disabled.')
  })

  els.fullBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await els.feed.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      showToast('Fullscreen is not available in this browser.')
    }
  })

  document.addEventListener('fullscreenchange', () => {
    els.fullBtn.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen')
  })

  els.gridBtn.addEventListener('click', () => {
    state.grid = !state.grid
    renderGrid()
    renderActive()
    if (state.grid) showToast('Showing all cameras.')
    else showToast(`Showing ${activeCamera().name}.`)
  })

  function snapshotBlob() {
    const camera = activeCamera()
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')

    if (state.grid) {
      const tiles = $$('canvas[data-grid-scene]', els.gridFeed)
      tiles.forEach((tile, index) => {
        const column = index % 2
        const row = Math.floor(index / 2)
        context.drawImage(tile, column * 640, row * 360, 640, 360)
      })
      context.fillStyle = 'rgba(4, 9, 18, 0.3)'
      context.fillRect(0, 0, 1280, 720)
    } else if (!els.mainVideo.hidden && els.mainVideo.videoWidth) {
      const ratio = Math.max(1280 / els.mainVideo.videoWidth, 720 / els.mainVideo.videoHeight)
      const width = els.mainVideo.videoWidth * ratio
      const height = els.mainVideo.videoHeight * ratio
      context.drawImage(els.mainVideo, (1280 - width) / 2, (720 - height) / 2, width, height)
    } else if (!els.mainImage.hidden && els.mainImage.complete && els.mainImage.naturalWidth) {
      const ratio = Math.max(1280 / els.mainImage.naturalWidth, 720 / els.mainImage.naturalHeight)
      const width = els.mainImage.naturalWidth * ratio
      const height = els.mainImage.naturalHeight * ratio
      context.drawImage(els.mainImage, (1280 - width) / 2, (720 - height) / 2, width, height)
    } else {
      paintCanvas(canvas, camera.scene, performance.now() / 1000)
    }
    return { canvas, camera }
  }

  els.snapshotBtn.addEventListener('click', () => {
    try {
      const { canvas, camera } = snapshotBlob()
      const link = document.createElement('a')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      link.download = `${camera.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}.png`
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
      link.remove()
      showToast(`Snapshot saved for ${camera.name}.`)
    } catch {
      showToast('Could not create a snapshot in this browser.')
    }
  })

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(message)
      return
    } catch {
      const field = document.createElement('textarea')
      field.value = text
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      try {
        document.execCommand('copy')
        showToast(message)
      } catch {
        showToast('Copy is unavailable in this browser.')
      }
      field.remove()
    }
  }

  $('#copyCodeBtn').addEventListener('click', () => copyText(accessCode, 'Access code copied.'))
  $('#copyLinkBtn').addEventListener('click', () => {
    const link = new URL(window.location.href)
    link.searchParams.set('viewer', accessCode)
    link.hash = ''
    copyText(link.toString(), '24-hour viewer link copied.')
  })

  els.accessCode.textContent = accessCode

  function openModal() {
    els.cameraModal.hidden = false
    const firstInput = els.cameraForm.querySelector('input[name="name"]')
    setTimeout(() => firstInput?.focus(), 30)
  }

  function closeModal() {
    els.cameraModal.hidden = true
    els.cameraForm.reset()
  }

  $('#addCameraBtn').addEventListener('click', openModal)
  $('#closeModalBtn').addEventListener('click', closeModal)
  $('#cancelModalBtn').addEventListener('click', closeModal)
  els.cameraModal.addEventListener('click', event => {
    if (event.target === els.cameraModal) closeModal()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !els.cameraModal.hidden) closeModal()
  })

  els.cameraForm.addEventListener('submit', event => {
    event.preventDefault()
    const form = new FormData(els.cameraForm)
    const name = String(form.get('name') || '').trim().slice(0, 40)
    const group = form.get('group') === 'Indoor' ? 'Indoor' : 'Outdoor'
    const rawUrl = String(form.get('streamUrl') || '').trim()
    if (!name) return
    let streamUrl = ''
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol')
        streamUrl = parsed.toString()
      } catch {
        showToast('Enter a valid http or https stream URL.')
        return
      }
    }

    const sceneKeys = ['driveway', 'living', 'backyard', 'nursery', 'frontdoor']
    const customCount = state.cameras.filter(camera => camera.custom).length
    const camera = {
      id: `custom-${Date.now()}`,
      name,
      group,
      scene: sceneKeys[customCount % sceneKeys.length],
      detail: streamUrl ? 'Remote stream · Secure link' : '1080p · Simulated preview',
      event: 'Camera added just now',
      streamUrl,
      custom: true
    }
    state.cameras.push(camera)
    saveCustomCameras()
    closeModal()
    state.filter = 'all'
    $$('[data-filter]').forEach(button => {
      const active = button.dataset.filter === 'all'
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', String(active))
    })
    state.activeId = camera.id
    renderCameraList()
    renderMiniGrid()
    renderActive()
    showToast(`${name} added to your console.`)
  })

  function handleNavigation(target) {
    $$('[data-nav]').forEach(button => button.classList.toggle('is-active', button.dataset.nav === target))
    if (target === 'live') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      showToast('Live view is ready.')
    } else if (target === 'events') {
      els.eventsStrip.scrollIntoView({ behavior: 'smooth', block: 'center' })
      showToast('Showing recent motion events.')
    } else if (target === 'cameras') {
      $('.sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' })
      showToast('Camera list is ready.')
    } else {
      showToast('Settings are simulated in this concept build.')
    }
  }

  $$('[data-nav]').forEach(button => {
    button.addEventListener('click', () => handleNavigation(button.dataset.nav))
  })

  $('#notificationsBtn').addEventListener('click', () => showToast('3 new motion alerts in the last hour.'))
  $('#accountBtn').addEventListener('click', () => showToast('Signed in as demo owner · Alex Rivera'))
  $('#viewAllBtn').addEventListener('click', () => {
    els.eventsStrip.scrollIntoView({ behavior: 'smooth', block: 'center' })
    showToast('All recent events are shown in this concept.')
  })
  $('#securityBtn').addEventListener('click', () => showToast('Viewer links expire after 24 hours.'))
  $$('[data-foot]').forEach(button => {
    button.addEventListener('click', () => showToast(`${button.dataset.foot[0].toUpperCase()}${button.dataset.foot.slice(1)} details are unavailable in this concept.`))
  })

  els.mainVideo.addEventListener('error', () => {
    if (els.mainVideo.hidden) return
    showToast('Stream unavailable — showing simulated preview.')
    els.mainVideo.hidden = true
    els.mainCanvas.hidden = false
    els.mainVideo.removeAttribute('src')
    els.mainVideo.load()
  })

  els.mainImage.addEventListener('error', () => {
    if (els.mainImage.hidden) return
    showToast('Image stream unavailable — showing simulated preview.')
    els.mainImage.hidden = true
    els.mainCanvas.hidden = false
    els.mainImage.removeAttribute('src')
  })

  /* ------------------------------------------------------------------ *
   * Boot and animation
   * ------------------------------------------------------------------ */

  let frameTime = 0
  function animate(time) {
    const seconds = time / 1000
    if (!state.paused) {
      const active = activeCamera()
      if (!state.grid && els.mainCanvas.hidden === false) paintCanvas(els.mainCanvas, active.scene, seconds)
      if (state.grid) {
        $$('canvas[data-grid-scene]', els.gridFeed).forEach(canvas => {
          paintCanvas(canvas, canvas.dataset.gridScene, seconds)
        })
      }
      frameTime = seconds
    } else if (!frameTime) {
      frameTime = seconds
    }
    requestAnimationFrame(animate)
  }

  function updateClock() {
    const now = new Date()
    els.feedClock.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  state.cameras = [...defaultCameras, ...readCustomCameras()]
  state.frozenAt = performance.now() / 1000
  if (state.cameras.some(camera => camera.id === 'front')) state.activeId = 'front'
  else state.activeId = state.cameras[0].id

  renderCameraList()
  renderMiniGrid()
  renderEvents()
  renderActive()
  updateClock()
  setInterval(updateClock, 1000)
  requestAnimationFrame(animate)

  const viewerLink = new URL(window.location.href).searchParams.get('viewer')
  if (viewerLink) setTimeout(() => showToast(`Viewer mode active · ${viewerLink}`), 700)

  document.documentElement.dataset.appReady = 'true'
  window.__XFINITY_CAM_READY__ = true
})()
