import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Constants ───────────────────────────────────────────────────────────────
const COLS = 42
const LAYERS = 3
const COUNT = COLS * LAYERS * 2 // 2 for top and bottom pillars
const WIDTH = 1.0
const RADIUS_HEX = 0.48 // Leaves a 0.04 gap between columns for 3D visibility
const DEPTH = 0.75      // Z-offset between layers
const MAX_HEIGHT = 16.0
const OPEN_Y_SHIFT = 9.0  // Leaves ~20% of jagged shapes visible on screen edges
const CURSOR_RADIUS = 8.0

// ─── Easing Functions ────────────────────────────────────────────────────────
function expoInOut(t) {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if ((t *= 2) < 1) return 0.5 * Math.pow(1024, t - 1);
  return 0.5 * (-Math.pow(2, -10 * (t - 1)) + 2);
}

function heavySlam(t) {
  if (t === 0) return 0;
  if (t < 0.85) {
      const nt = t / 0.85;
      return Math.pow(2, 10 * (nt - 1));
  } else {
      const nt = (t - 0.85) / 0.15;
      return 1.0 - 0.04 * Math.sin(nt * Math.PI);
  }
}

// ─── Material Setup ──────────────────────────────────────────────────────────
const PLANE_MATERIAL = new THREE.MeshBasicMaterial({
  colorWrite:   false,
  depthWrite:   false,
  transparent:  true,
  opacity:      0,
})

export default function InstancedGate() {
  const meshRef = useRef(null)
  const pointerHit = useRef(new THREE.Vector2(0, 0))
  const isHovered = useRef(false)
  const { invalidate } = useThree()
  
  const dummy = useMemo(() => new THREE.Object3D(), [])
  
  // Separate per-instance states for dynamic reactive cursor tracking
  const progresses = useMemo(() => new Float32Array(COUNT), [])
  const states = useMemo(() => new Int8Array(COUNT), []) // 1 for opening, -1 for closing
  
  const instances = useMemo(() => {
    const data = []
    
    for (let layer = 0; layer < LAYERS; layer++) {
      for (let col = 0; col < COLS; col++) {
        // Stagger logic: shift every other layer to overlap gaps
        const offsetX = (layer % 2 === 1) ? (WIDTH / 2) : 0.0
        const offsetY = layer * 0.6
        
        const x = (col - COLS / 2) * WIDTH + (WIDTH / 2) + offsetX
        const z = -layer * DEPTH
        
        // Interlocking teeth logic
        const hash = Math.sin(col * 12.9898 + layer * 78.233) * 43758.5453;
        const randomMeet = (hash - Math.floor(hash)) * 4.0 - 2.0;
        const meetY = randomMeet + offsetY
        
        // Top Pillar setup
        const topBottomY = meetY - 0.05 / 2
        const topTopY = MAX_HEIGHT
        const topHeight = topTopY - topBottomY
        const topCenterY = topBottomY + topHeight / 2
        
        data.push({
          x, z, meetY,
          y: topCenterY,
          scaleY: topHeight,
          dirY: 1,
          layer
        })
        
        // Bottom Pillar setup
        const bottomTopY = meetY + 0.05 / 2
        const bottomBottomY = -MAX_HEIGHT
        const bottomHeight = bottomTopY - bottomBottomY
        const bottomCenterY = bottomBottomY + bottomHeight / 2
        
        data.push({
          x, z, meetY,
          y: bottomCenterY,
          scaleY: bottomHeight,
          dirY: -1,
          layer
        })
      }
    }
    return data
  }, [])
  
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    
    const baseColor = new THREE.Color(0x333333)
    const darkenFactor = [1.0, 0.45, 0.15]
    
    for (let i = 0; i < COUNT; i++) {
      const inst = instances[i]
      
      dummy.position.set(inst.x, inst.y, inst.z)
      dummy.scale.set(1, inst.scaleY, 1) // Cylinder geometry has radius, so scale X/Z is 1
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      
      const layerColor = baseColor.clone().multiplyScalar(darkenFactor[inst.layer])
      mesh.setColorAt(i, layerColor)
    }
    
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [instances, dummy, invalidate])
  
  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    
    let needsUpdate = false
    
    for (let i = 0; i < COUNT; i++) {
      const inst = instances[i]
      
      let target = 0
      if (isHovered.current) {
         let dx = inst.x - pointerHit.current.x
         let dy = inst.meetY - pointerHit.current.y
         let dist = Math.sqrt(dx*dx + dy*dy)
         
         // Add stochastic stagger to radius to make it feel organic and jagged
         let effectiveDist = dist + inst.layer * 1.5
         
         if (effectiveDist < CURSOR_RADIUS) {
             target = 1.0
         }
      }
      
      let current = progresses[i]
      if (current !== target) {
          needsUpdate = true
          if (target > current) {
              current = Math.min(1.0, current + delta * 1.8) // Opening speed
              states[i] = 1
          } else {
              current = Math.max(0.0, current - delta * 1.5) // Closing speed
              states[i] = -1
          }
          progresses[i] = current
          
          let ease = 0
          if (current === 1) ease = 1
          else if (current === 0) ease = 0
          else {
              if (states[i] === 1) {
                  ease = expoInOut(current)
              } else {
                  const t_close = 1.0 - current
                  ease = 1.0 - heavySlam(t_close)
              }
          }
          
          const currentY = inst.y + (ease * OPEN_Y_SHIFT * inst.dirY)
          
          dummy.position.set(inst.x, currentY, inst.z)
          dummy.scale.set(1, inst.scaleY, 1)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
      }
    }
    
    if (needsUpdate) {
      mesh.instanceMatrix.needsUpdate = true
      invalidate()
    }
  })
  
  const handlePointerMove = (e) => {
    e.stopPropagation()
    pointerHit.current.set(e.point.x, e.point.y)
    if (!isHovered.current) {
        isHovered.current = true
    }
    invalidate()
  }

  const handlePointerLeave = (e) => {
    e.stopPropagation()
    isHovered.current = false
    invalidate()
  }
  
  return (
    <group>
      {/* Invisible raycasting plane */}
      <mesh
        position={[0, 0, 0.5]}
        material={PLANE_MATERIAL}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        renderOrder={-1}
      >
        <planeGeometry args={[COLS * WIDTH + 4, MAX_HEIGHT * 2 + 4]} />
      </mesh>
      
      <instancedMesh ref={meshRef} args={[null, null, COUNT]} castShadow={false} receiveShadow={false}>
        {/* Hexagonal Prism (6 segments). radius = 0.48 gives small gaps for 3D texture */}
        <cylinderGeometry args={[RADIUS_HEX, RADIUS_HEX, 1, 6]} />
        <meshStandardMaterial color={0xffffff} metalness={0.8} roughness={0.3} />
      </instancedMesh>
    </group>
  )
}
