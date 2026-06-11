import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

const DEFAULT_CENTER = { lat: 40.12417, lng: -111.5813977 }
const DEFAULT_ZOOM   = 18.5
const MAPS_KEY       = import.meta.env.VITE_GOOGLE_MAPS_KEY

const HOLE_COLORS = [
  '#C94B1A','#E07B2A','#D4A832','#8B9E3A','#1D5C54',
  '#C94B1A','#E07B2A','#D4A832','#8B9E3A',
]

// ── Google Maps loader ─────────────────────────────────────────────────────
let mapsPromise = null
function loadMapsApi() {
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(window.google.maps); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}`
    script.async = true
    script.onload  = () => resolve(window.google.maps)
    script.onerror = () => { mapsPromise = null; reject(new Error('Google Maps failed to load. Check your API key.')) }
    document.head.appendChild(script)
  })
  return mapsPromise
}

// ── SVG marker builders ────────────────────────────────────────────────────
function makePinSvg(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2.5"/>
    <text x="18" y="23" text-anchor="middle" font-family="Arial,sans-serif"
      font-size="${label.length > 2 ? 10 : 14}" fill="white" font-weight="bold">${label}</text>
    <polygon points="18,40 11,28 25,28" fill="${color}"/>
  </svg>`
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

function makeBucketSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="13" fill="#1D5C54" stroke="white" stroke-width="2.5"/>
    <text x="15" y="20" text-anchor="middle" font-size="14">🪣</text>
  </svg>`
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

// ── Component ──────────────────────────────────────────────────────────────
export default function CourseDesigner() {
  const mapDivRef  = useRef(null)
  const mapRef     = useRef(null)
  const markersRef = useRef([])
  const placeModeRef  = useRef(null)
  const activeHoleRef = useRef(null)

  const [mapsApi,  setMapsApi]  = useState(null)
  const [mapError, setMapError] = useState(null)
  const [holes,    setHoles]    = useState([])
  const [activeHole,  setActiveHole]  = useState(null)
  const [placeMode,   setPlaceMode]   = useState(null) // 'tee' | 'bucket' | null
  const [courseName,  setCourseName]  = useState('Week Course')
  const [designedBy,  setDesignedBy]  = useState('')
  const [savedCourses,setSavedCourses]= useState([])
  const [panel,       setPanel]       = useState('design')
  const [mapReady,    setMapReady]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState(null)
  const [loadingCourses, setLoadingCourses] = useState(false)

  // keep refs in sync
  useEffect(() => { placeModeRef.current  = placeMode  }, [placeMode])
  useEffect(() => { activeHoleRef.current = activeHole }, [activeHole])

  // Load Maps API
  useEffect(() => {
    if (!MAPS_KEY) { setMapError('no_key'); return }
    loadMapsApi().then(setMapsApi).catch(e => setMapError(e.message))
  }, [])

  // Init map
  useEffect(() => {
    if (!mapsApi || !mapDivRef.current || mapRef.current) return
    const map = new mapsApi.Map(mapDivRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
    })
    mapRef.current = map
    setMapReady(true)

    // Click to place
    map.addListener('click', (e) => {
      const mode = placeModeRef.current
      const hole = activeHoleRef.current
      if (!mode || hole === null) return
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() }
      setHoles(prev => prev.map(h => h.num === hole ? { ...h, [mode]: pos } : h))
      if (mode === 'tee') setPlaceMode('bucket')
      else setPlaceMode(null)
    })
  }, [mapsApi])

  // Sync markers whenever holes change
  useEffect(() => {
    if (!mapsApi || !mapRef.current) return

    markersRef.current.forEach(({ teeM, bucketM, line }) => {
      teeM?.setMap(null); bucketM?.setMap(null); line?.setMap(null)
    })
    markersRef.current = []

    holes.forEach(h => {
      const color = HOLE_COLORS[(h.num - 1) % HOLE_COLORS.length]
      let teeM = null, bucketM = null, line = null

      if (h.tee) {
        teeM = new mapsApi.Marker({
          position: h.tee, map: mapRef.current, draggable: true,
          icon: { url: makePinSvg(String(h.num), color), anchor: new mapsApi.Point(18, 44) },
          zIndex: h.num,
        })
        teeM.addListener('dragend', e => {
          setHoles(prev => prev.map(hh => hh.num === h.num
            ? { ...hh, tee: { lat: e.latLng.lat(), lng: e.latLng.lng() } } : hh))
        })
      }

      if (h.bucket) {
        bucketM = new mapsApi.Marker({
          position: h.bucket, map: mapRef.current, draggable: true,
          icon: { url: makeBucketSvg(), anchor: new mapsApi.Point(15, 15) },
          zIndex: h.num,
        })
        bucketM.addListener('dragend', e => {
          setHoles(prev => prev.map(hh => hh.num === h.num
            ? { ...hh, bucket: { lat: e.latLng.lat(), lng: e.latLng.lng() } } : hh))
        })
      }

      if (h.tee && h.bucket) {
        line = new mapsApi.Polyline({
          path: [h.tee, h.bucket],
          strokeColor: color, strokeOpacity: 0.85, strokeWeight: 2.5,
          icons: [{ icon: { path: mapsApi.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 }, offset: '100%' }],
          map: mapRef.current,
        })
      }

      markersRef.current.push({ holeNum: h.num, teeM, bucketM, line })
    })
  }, [holes, mapsApi])

  function addHole() {
    if (holes.length >= 9) return
    const num = holes.length + 1
    setHoles(prev => [...prev, { num, tee: null, bucket: null }])
    setActiveHole(num)
    setPlaceMode('tee')
  }

  function removeHole(num) {
    setHoles(prev => prev.filter(h => h.num !== num).map((h, i) => ({ ...h, num: i + 1 })))
    if (activeHole === num) { setActiveHole(null); setPlaceMode(null) }
  }

  function activatePlace(num, mode) {
    const h = holes.find(hh => hh.num === num)
    setActiveHole(num)
    setPlaceMode(mode)
    if (h?.tee && mapRef.current) mapRef.current.panTo(h.tee)
    else if (mapRef.current) mapRef.current.panTo(DEFAULT_CENTER)
  }

  async function saveCourse() {
    setSaving(true); setSaveMsg(null)
    try {
      const { error } = await supabase.from('courses').insert({
        name: courseName, designed_by: designedBy || null,
        center_lat: DEFAULT_CENTER.lat, center_lng: DEFAULT_CENTER.lng,
        holes,
      })
      if (error) throw error
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (e) { setSaveMsg('error:' + e.message) }
    finally { setSaving(false) }
  }

  async function loadSavedCourses() {
    setLoadingCourses(true)
    const { data } = await supabase.from('courses').select('*').order('created_at', { ascending: false })
    setSavedCourses(data || [])
    setLoadingCourses(false)
  }

  function loadCourse(c) {
    setHoles(c.holes || [])
    setCourseName(c.name)
    setDesignedBy(c.designed_by || '')
    setActiveHole(null); setPlaceMode(null)
    setPanel('design')
    // Pan after React re-renders and map div is back in the DOM
    setTimeout(() => {
      if (mapRef.current && c.holes?.[0]?.tee) {
        mapRef.current.panTo(c.holes[0].tee)
        mapRef.current.setZoom(DEFAULT_ZOOM)
      }
    }, 100)
  }

  const completedHoles = holes.filter(h => h.tee && h.bucket).length

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--teal-dark)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <Link to="/" className="text-xs tracking-widest" style={{ color: 'var(--cream-dark)' }}>← STANDINGS</Link>
          <h1 className="font-display text-3xl tracking-widest" style={{ color: 'var(--amber)' }}>COURSE DESIGNER</h1>
        </div>
        <div className="flex gap-1.5">
          {['design','saved'].map(p => (
            <button key={p} onClick={() => { setPanel(p); if (p==='saved') loadSavedCourses() }}
              className="px-3 py-1.5 rounded text-xs font-semibold tracking-widest uppercase"
              style={{ background: panel===p ? 'var(--rust)' : 'rgba(255,255,255,0.08)', color: 'var(--cream)' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── DESIGN PANEL ─────────────────────────────────────────────── */}
      <div style={{ display: panel === 'design' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Map — takes remaining space above bottom sheet */}
          <div className="relative" style={{ flex: '1 1 0', minHeight: 0 }}>
            {mapError === 'no_key' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="text-4xl mb-3">🗺️</div>
                <p className="font-display text-2xl tracking-wide mb-1" style={{ color: 'var(--amber)' }}>API Key Needed</p>
                <p className="text-sm mb-3" style={{ color: 'var(--cream-dark)' }}>
                  Add your Google Maps key to <code className="px-1 rounded" style={{ background: 'rgba(255,255,255,0.1)' }}>.env.local</code>:
                </p>
                <code className="text-xs px-3 py-2 rounded block" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--cream)' }}>
                  VITE_GOOGLE_MAPS_KEY=your_key_here
                </code>
              </div>
            ) : mapError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <p className="text-sm" style={{ color: '#f87171' }}>{mapError}</p>
              </div>
            ) : (
              <div ref={mapDivRef} className="absolute inset-0" />
            )}

            {/* Placement hint banner */}
            {placeMode && activeHole && (
              <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
                <div className="px-4 py-2 rounded-full text-sm font-semibold shadow-xl"
                  style={{ background: placeMode==='tee' ? 'var(--rust)' : 'var(--teal)', color: 'var(--cream)' }}>
                  Tap map → place {placeMode==='tee' ? '🏌🏼‍♂️ tee' : '🪣 bucket'} for hole {activeHole}
                </div>
              </div>
            )}

            {/* Cancel placement */}
            {placeMode && (
              <button onClick={() => setPlaceMode(null)}
                className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}>
                ✕ Cancel
              </button>
            )}

            {/* Re-center */}
            <button onClick={() => { mapRef.current?.setCenter(DEFAULT_CENTER); mapRef.current?.setZoom(DEFAULT_ZOOM) }}
              className="absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg"
              style={{ background: 'rgba(0,0,0,0.65)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}>
              ◎
            </button>
          </div>

          {/* Bottom sheet */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '45vh', background: 'var(--teal-dark)', borderTop: '2px solid var(--rust)' }}>

            {/* Course name + designer */}
            <div className="px-3 pt-3 pb-2 flex gap-2">
              <input value={courseName} onChange={e => setCourseName(e.target.value)}
                placeholder="Course name"
                className="flex-1 rounded px-3 py-2 text-sm font-semibold outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
              <input value={designedBy} onChange={e => setDesignedBy(e.target.value)}
                placeholder="Designed by"
                className="w-28 rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }} />
            </div>

            {/* Holes */}
            <div className="px-3 pb-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs tracking-widest font-semibold" style={{ color: 'var(--cream-dark)' }}>
                  HOLES · {completedHoles}/{holes.length} COMPLETE
                </span>
                {holes.length < 9 && (
                  <button onClick={addHole} className="px-3 py-1 rounded text-xs font-semibold"
                    style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                    + Add hole
                  </button>
                )}
              </div>

              {holes.length === 0 && (
                <p className="text-sm py-1" style={{ color: 'var(--cream-dark)' }}>
                  Add a hole, then tap the map to drop a tee 🏌🏼‍♂️ and bucket 🪣.
                </p>
              )}

              <div className="space-y-1.5">
                {holes.map(h => {
                  const color = HOLE_COLORS[(h.num-1) % HOLE_COLORS.length]
                  const isActive = activeHole === h.num
                  return (
                    <div key={h.num} className="rounded-lg"
                      style={{ border: `2px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`, background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-display text-sm flex-shrink-0"
                          style={{ background: color, color: 'white' }}>{h.num}</div>
                        <div className="flex-1 flex gap-3 text-xs">
                          <span style={{ color: h.tee ? '#4ade80' : 'var(--cream-dark)' }}>
                            {h.tee ? '🏌🏼‍♂️✓' : '🏌🏼‍♂️ —'}
                          </span>
                          <span style={{ color: h.bucket ? '#4ade80' : 'var(--cream-dark)' }}>
                            {h.bucket ? '🪣✓' : '🪣 —'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => activatePlace(h.num, 'tee')}
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{ background: 'rgba(201,75,26,0.35)', color: 'var(--cream)' }}>🏌🏼‍♂️</button>
                          <button onClick={() => activatePlace(h.num, 'bucket')}
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{ background: 'rgba(29,92,84,0.5)', color: 'var(--cream)' }}>🪣</button>
                          <button onClick={() => removeHole(h.num)}
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{ background: 'rgba(255,255,255,0.06)', color: '#f87171' }}>✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Save */}
            <div className="px-3 pb-4">
              {saveMsg === 'saved' && (
                <div className="rounded p-2 text-xs text-center mb-2" style={{ background: '#14532d', color: '#86efac' }}>
                  Course saved! ✓
                </div>
              )}
              {saveMsg?.startsWith('error') && (
                <div className="rounded p-2 text-xs text-center mb-2" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                  {saveMsg.replace('error:', '')}
                </div>
              )}
              <button onClick={saveCourse} disabled={saving || holes.length === 0}
                className="w-full py-3 rounded-xl font-display text-xl tracking-widest disabled:opacity-30"
                style={{ background: 'var(--rust)', color: 'var(--cream)' }}>
                {saving ? 'SAVING...' : `💾 SAVE COURSE`}
              </button>
            </div>
          </div>
      </div>

      {/* ── SAVED PANEL ──────────────────────────────────────────────── */}
      {panel === 'saved' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingCourses && (
            <p className="text-center py-10" style={{ color: 'var(--cream-dark)' }}>Loading...</p>
          )}
          {!loadingCourses && savedCourses.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🗺️</div>
              <p className="font-display text-2xl tracking-wide" style={{ color: 'var(--amber)' }}>No courses saved yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--cream-dark)' }}>Design your first course on the Design tab.</p>
            </div>
          )}
          <div className="space-y-3">
            {savedCourses.map(c => {
              const done = (c.holes||[]).filter(h=>h.tee&&h.bucket).length
              return (
                <div key={c.id} className="rounded-xl overflow-hidden" style={{ border: '2px solid var(--rust)' }}>
                  <div className="px-4 py-2" style={{ background: 'var(--sunset)', color: 'var(--ink)' }}>
                    <span className="font-display text-xl tracking-widest">{c.name}</span>
                  </div>
                  <div className="px-4 py-3">
                    {c.designed_by && (
                      <p className="text-sm mb-1" style={{ color: 'var(--cream-dark)' }}>
                        Designed by <strong style={{ color: 'var(--cream)' }}>{c.designed_by}</strong>
                      </p>
                    )}
                    <p className="text-xs mb-2" style={{ color: 'var(--cream-dark)' }}>
                      {done}/{(c.holes||[]).length} holes complete · {new Date(c.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(c.holes||[]).map(h => {
                        const complete = h.tee && h.bucket
                        const color = HOLE_COLORS[(h.num-1) % HOLE_COLORS.length]
                        return (
                          <div key={h.num} className="w-7 h-7 rounded-full flex items-center justify-center font-display text-sm"
                            style={{ background: complete ? color : 'rgba(255,255,255,0.1)', color:'white', opacity: complete?1:0.35 }}>
                            {h.num}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => loadCourse(c)}
                        className="flex-1 py-2 rounded-lg font-display tracking-widest text-base"
                        style={{ background: 'var(--teal)', color: 'var(--cream)' }}>
                        LOAD & EDIT →
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Delete "${c.name}"?`)) return
                        await supabase.from('courses').delete().eq('id', c.id)
                        setSavedCourses(prev => prev.filter(x => x.id !== c.id))
                      }}
                        className="px-4 py-2 rounded-lg font-display tracking-widest text-base"
                        style={{ background: 'rgba(127,29,29,0.5)', color: '#fca5a5' }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
