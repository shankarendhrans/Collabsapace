import React, { CSSProperties } from 'react';

export interface CrystalizedBallProps {
  preset?: 'plasma' | 'aurora' | 'nebula' | 'ember' | 'frost' | 'solar' | 'eclipse' | 'abyss';
  color?: string;
  theme?: 'dark' | 'light';
  size?: number;
  strands?: number;
  crackle?: number;
  flares?: number;
  glow?: number;
  sparks?: number;
  particleCount?: number;
  fill?: number;
  motion?: 'rise' | 'fall' | 'drift' | 'orbit';
  particleShape?: 'square' | 'round';
  depth?: number;
  sway?: number;
  twinkle?: number;
  haze?: number;
  speed?: number;
  dustSpeed?: number;
  interactive?: boolean;
  hoverStrength?: number;
  intro?: boolean;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
}

declare const CrystalizedBall: React.FC<CrystalizedBallProps>;
export default CrystalizedBall;
