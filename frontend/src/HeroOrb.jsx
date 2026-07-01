import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Sparkles, Float } from '@react-three/drei'

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Orb() {
  const meshRef = useRef(null)

  useFrame((_, delta) => {
    if (REDUCED_MOTION || !meshRef.current) return
    meshRef.current.rotation.y += delta * 0.12
    meshRef.current.rotation.x += delta * 0.04
  })

  return (
    <Float speed={REDUCED_MOTION ? 0 : 1.4} rotationIntensity={0.3} floatIntensity={0.6}>
      <mesh ref={meshRef} scale={2.2}>
        <icosahedronGeometry args={[1, 5]} />
        <MeshDistortMaterial
          color="#8B5CF6"
          emissive="#10B981"
          emissiveIntensity={0.15}
          roughness={0.15}
          metalness={0.4}
          distort={0.35}
          speed={REDUCED_MOTION ? 0 : 1.6}
        />
      </mesh>
    </Float>
  )
}

export default function HeroOrb({ className = '' }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 1.25]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement
          canvas.addEventListener('webglcontextlost', (e) => e.preventDefault())
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <pointLight position={[4, 3, 5]} intensity={1.4} color="#22D3EE" />
          <pointLight position={[-4, -2, -3]} intensity={1.1} color="#8B5CF6" />
          <Orb />
          <Sparkles count={35} scale={7} size={2} speed={REDUCED_MOTION ? 0 : 0.3} color="#34D399" opacity={0.5} />
        </Suspense>
      </Canvas>
    </div>
  )
}
