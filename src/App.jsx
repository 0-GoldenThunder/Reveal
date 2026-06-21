import React from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Noise, SMAA } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import InstancedGate from './components/InstancedGate'

export default function App() {
  return (
    <>
      {/* Background Image that will be revealed */}
      <img 
        src="/88087827-pixel-art-crystalline-cave-glowing-geodes-underground-compressed.jpg_202606210912.jpeg" 
        alt="Revealed reflection" 
        className="bg-image" 
      />

      {/* Transparent Canvas Overlay */}
      <Canvas
        className="canvas-container"
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 0, 24], fov: 45, near: 0.1, far: 200 }}
        gl={{ alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 20]} intensity={1.5} />
        
        <InstancedGate />

        <EffectComposer>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.05}
            radius={0.6}
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new Vector2(0.0006, 0.0006)}
          />
          <Noise
            blendFunction={BlendFunction.SOFT_LIGHT}
            opacity={0.06}
          />
          <SMAA />
        </EffectComposer>
      </Canvas>
    </>
  )
}
