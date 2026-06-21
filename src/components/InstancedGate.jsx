import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Constants ───────────────────────────────────────────────────────────────
const COLS = 34
const LAYERS = 4
const COUNT = COLS * LAYERS * 2 // 2 for top and bottom pillars
const WIDTH = 1.6
const BOX_SIZE = 1.45 // Leaves a gap between columns for 3D visibility
const DEPTH = 1.2      // Z-offset between layers
const MAX_HEIGHT = 16.0
const OPEN_Y_SHIFT = 10.0  // Increased to reveal more of the background
const CURSOR_RADIUS = 13.0

// ─── Easing Functions ────────────────────────────────────────────────────────
function cubicInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
        const isFrontline = layer === 0;
        
        // Stagger logic: shift every other layer to overlap gaps
        const offsetX = (layer % 2 === 1) ? (WIDTH / 2) : 0.0
        const offsetY = layer * 0.8
        
        // Interlocking teeth logic & Randomization
        const hash1 = Math.sin(col * 12.9898 + layer * 78.233) * 43758.5453;
        const rand1 = hash1 - Math.floor(hash1);
        
        const hash2 = Math.sin(col * 43.123 + layer * 12.312) * 43758.5453;
        const rand2 = hash2 - Math.floor(hash2);

        const randomMeet = rand1 * 6.0 - 3.0; // more varied meet Y
        const meetY = randomMeet + offsetY
        
        // Random depths and offsets to make it non-linear when closed
        const randomZ = isFrontline ? 0 : (rand2 * 0.6); 
        // No random X for frontline to avoid breaking the solid wall
        const randomX = isFrontline ? 0 : (rand1 - 0.5) * 0.2;

        const x = (col - COLS / 2) * WIDTH + (WIDTH / 2) + offsetX + randomX
        const z = -layer * DEPTH + randomZ
        
        // Random stagger speed for animation
        const randomStagger = rand2;
        
        // Scale X to aggressively remove horizontal gaps on frontline
        const scaleX = isFrontline ? (WIDTH / BOX_SIZE) : 1.0;
        
        // Inner layers open less, creating a stepped archway
        const openShift = OPEN_Y_SHIFT - layer * 1.0;
        
        // The vertical gap between top and bottom cubes
        // Frontline gets a 0 gap to completely seal the wall without overlapping
        const gapY = 0.0;
        
        // Top Pillar setup
        const topBottomY = meetY + gapY / 2
        const topTopY = MAX_HEIGHT + rand1 * 4.0
        const topHeight = topTopY - topBottomY
        const topCenterY = topBottomY + topHeight / 2
        
        data.push({
          x, z, meetY,
          y: topCenterY,
          scaleX,
          scaleY: topHeight,
          dirY: 1,
          layer,
          randomStagger,
          openShift
        })
        
        // Bottom Pillar setup
        const bottomTopY = meetY - gapY / 2
        const bottomBottomY = -MAX_HEIGHT - rand2 * 4.0
        const bottomHeight = bottomTopY - bottomBottomY
        const bottomCenterY = bottomBottomY + bottomHeight / 2
        
        data.push({
          x, z, meetY,
          y: bottomCenterY,
          scaleX,
          scaleY: bottomHeight,
          dirY: -1,
          layer,
          randomStagger,
          openShift
        })
      }
    }
    return data
  }, [])
  
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    
    const baseColor = new THREE.Color(0x333333)
    const darkenFactor = [1.0, 0.85, 0.65, 0.45]
    
    for (let i = 0; i < COUNT; i++) {
      const inst = instances[i]
      
      dummy.position.set(inst.x, inst.y, inst.z)
      dummy.scale.set(inst.scaleX, inst.scaleY, 1) // Apply custom X scale
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
      
      // Always calculate distance so closing also feels organic
      let dx = inst.x - pointerHit.current.x
      let dy = inst.meetY - pointerHit.current.y
      let dist = Math.sqrt(dx*dx + dy*dy)
      let effectiveDist = dist + inst.layer * 1.5
      
      if (isHovered.current && effectiveDist < CURSOR_RADIUS) {
          target = 1.0
      }
      
      let current = progresses[i]
      if (current !== target) {
          needsUpdate = true
          
          let speedOpen = 1.4 + inst.randomStagger * 0.6
          let speedClose = 1.0 + inst.randomStagger * 0.5
          
          if (target > current) {
              current = Math.min(1.0, current + delta * speedOpen) // Smooth opening
              states[i] = 1
          } else {
              current = Math.max(0.0, current - delta * speedClose) // Smooth closing
              states[i] = -1
          }
          progresses[i] = current
          
          let ease = cubicInOut(current)
          
          const currentY = inst.y + (ease * inst.openShift * inst.dirY)
          
          dummy.position.set(inst.x, currentY, inst.z)
          dummy.scale.set(inst.scaleX, inst.scaleY, 1)
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
        <boxGeometry args={[BOX_SIZE, 1, BOX_SIZE]} />
        <meshStandardMaterial color={0xffffff} metalness={0.8} roughness={0.3} />
      </instancedMesh>
    </group>
  )
}
