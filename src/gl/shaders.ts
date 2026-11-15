// 所有 GLSL 着色器源码（WebGL2 / GLSL ES 3.00）

const NOISE = `
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1,0));
  float c = hash21(i+vec2(0,1));
  float d = hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p, int oct){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){
    if(i>=oct) break;
    v += a*vnoise(p);
    p = p*2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}
`;

const TONEMAP = `
vec3 tonemap(vec3 c){
  c = vec3(1.0) - exp(-c*1.7);
  return pow(max(c, 0.0), vec3(1.0/2.2));
}
`;

// ---------------- 蜡体 ----------------

export const WAX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aThick;   // 局部厚度（到轴心距离）
layout(location=3) in float aRadial;  // 顶盖用：离轴心径向距离
layout(location=4) in float aCap;     // 是否顶盖顶点
layout(location=5) in float aH;       // 归一化高度 0..1
uniform mat4 uProj, uView;
uniform float uMeltR;     // 熔池半径
uniform float uMeltDip;   // 熔池下凹深度
out vec3 vWorld; out vec3 vNormal;
out float vThick; out float vRadial; out float vCap; out float vH;
void main(){
  vec3 p = aPos;
  // 熔池：顶盖在熔池范围内下凹
  if(aCap > 0.5 && uMeltR > 0.001 && aRadial < uMeltR){
    float k = 1.0 - aRadial/uMeltR;
    p.y -= uMeltDip * k*k;
  }
  vWorld = p; vNormal = aNormal;
  vThick = aThick; vRadial = aRadial; vCap = aCap; vH = aH;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const WAX_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal;
in float vThick; in float vRadial; in float vCap; in float vH;
uniform vec3 uEye;
uniform vec3 uFlamePos;
uniform float uFlameI;      // 火焰强度（含闪烁）
uniform vec3 uFlameColor;
uniform float uLit;
uniform float uMeltR;
uniform float uSSS;         // 消光系数：越大越不透
uniform vec3 uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uLayerColor[4];
uniform vec2 uLayerRange[4];
uniform int uLayerCount;
uniform float uWaxTop;
out vec4 outColor;
${TONEMAP}
void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vWorld);

  // 分层渐变基色
  vec3 base = uLayerColor[0];
  for(int i=1;i<4;i++){
    if(i>=uLayerCount) break;
    float edge = uLayerRange[i].x;
    base = mix(base, uLayerColor[i], smoothstep(edge-0.045, edge+0.045, vH));
  }

  // 环境 + 主光（wrap diffuse，蜡的柔和感）
  float ndl = dot(n, uKeyDir)*0.5 + 0.5;
  vec3 col = base * (uAmbient + uKeyColor * ndl * ndl);

  // ---- 次表面散射近似：厚度 × 离焰距离 双重指数衰减 ----
  vec3 toFlame = uFlamePos - vWorld;
  float d = length(toFlame);
  vec3 ldir = toFlame / max(d, 1e-4);
  float attDist = uFlameI / (1.0 + 26.0*d*d);        // 离火焰越远越暗
  float attThick = exp(-uSSS * vThick);               // 越厚越不透
  float backlit = clamp(0.5 + 0.5*dot(v, -ldir), 0.0, 1.0); // 背光方向更透
  vec3 trans = uFlameColor * attDist * attThick * (0.35 + 0.65*backlit);
  col += trans * mix(base, vec3(1.0, 0.82, 0.55), 0.4) * uLit;

  // ---- 熔池：顶盖液态区更透亮、微微发光 ----
  float emissive = 0.0;
  if(vCap > 0.5 && uMeltR > 0.001){
    float liquid = 1.0 - smoothstep(uMeltR*0.8, uMeltR, vRadial);
    // 液面反射火焰的暖光
    emissive = liquid * uLit * (0.35 + 0.65*uFlameI);
    col += uFlameColor * emissive * mix(vec3(1.0), base, 0.35) * 0.9;
    // 熔池边缘一圈更亮（液固交界）
    float rim = smoothstep(uMeltR*0.8, uMeltR, vRadial) * (1.0 - smoothstep(uMeltR, uMeltR*1.12, vRadial));
    col += uFlameColor * rim * uLit * attDist * 2.0;
  }
  // 蜡体上沿靠近火焰的一圈暖染色
  float nearTop = smoothstep(uWaxTop - 0.18, uWaxTop, vWorld.y);
  col += uFlameColor * nearTop * uLit * attDist * attThick * 1.5;

  col = tonemap(col);

  // 半透明度：越薄越透，让杯内干花半隐半现
  float alpha = 0.97 - 0.38 * clamp(attThick * uLit, 0.0, 1.0);
  outColor = vec4(col, alpha);
}`;

// ---------------- 容器杯 ----------------

export const CUP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView;
out vec3 vWorld; out vec3 vNormal;
void main(){
  vWorld = aPos; vNormal = aNormal;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const CUP_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal;
uniform vec3 uEye;
uniform int uType;          // 0 玻璃 1 陶瓷 2 金属
uniform vec3 uColor;
uniform vec3 uFlamePos;
uniform float uFlameI;
uniform vec3 uFlameColor;
uniform float uLit;
uniform float uMeltGlow;    // 熔池大小 0..1，杯壁暖光跟着变
uniform vec3 uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uCupH;
out vec4 outColor;
${TONEMAP}
void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vWorld);
  if(dot(n, v) < 0.0) n = -n;

  vec3 toFlame = uFlamePos - vWorld;
  float d = length(toFlame);
  vec3 ldir = toFlame / max(d, 1e-4);
  // 杯壁暖光：随火焰强度与熔池大小衰减变化
  float glowK = uLit * uFlameI * (0.5 + 0.9*uMeltGlow) / (1.0 + 34.0*d*d);
  vec3 flameLight = uFlameColor * glowK;

  float ndl = clamp(dot(n, uKeyDir), 0.0, 1.0);
  vec3 h = normalize(v + uKeyDir);
  vec3 hf = normalize(v + ldir);
  float specKey = pow(clamp(dot(n, h), 0.0, 1.0), 60.0);
  float specFlame = pow(clamp(dot(n, hf), 0.0, 1.0), 60.0);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

  vec3 col; float alpha;
  if(uType == 0){
    // 玻璃：菲涅尔控制透明度，带染色与高光
    col = uColor * (uAmbient*0.7 + uKeyColor*ndl*0.4);
    col += flameLight * 0.9;
    col += (uKeyColor*specKey + uFlameColor*specFlame*uLit) * 1.2;
    col += uAmbient * fres * 0.8;
    alpha = clamp(mix(0.10, 0.62, fres) + specKey*0.4, 0.0, 0.9);
  } else if(uType == 2){
    // 金属：强高光 + 假环境反射
    vec3 r = reflect(-v, n);
    vec3 env = mix(uAmbient*0.4, uKeyColor*0.9, clamp(r.y*0.5+0.5, 0.0, 1.0));
    col = uColor * (uAmbient*0.5 + env*0.6 + uKeyColor*ndl*0.35);
    col += flameLight * (uColor*0.6 + 0.4);
    col += (uKeyColor*specKey + uFlameColor*specFlame*uLit*1.5) * 1.6;
    alpha = 1.0;
  } else {
    // 陶瓷：哑光漫反射 + 弱高光
    col = uColor * (uAmbient + uKeyColor*ndl);
    col += flameLight * uColor * 1.2;
    col += (uKeyColor*specKey*0.25 + uFlameColor*specFlame*uLit*0.4);
    alpha = 1.0;
  }
  col = tonemap(col);
  outColor = vec4(col, alpha);
}`;

// ---------------- 桌面 ----------------

export const DESK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj, uView;
out vec3 vWorld;
void main(){
  vWorld = aPos;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const DESK_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uBaseColor;
uniform vec3 uAmbient;
uniform vec3 uFlamePos;
uniform float uFlameI;
uniform vec3 uFlameColor;
uniform float uLit;
uniform float uMeltGlow;
uniform float uIsNight;
out vec4 outColor;
${NOISE}
${TONEMAP}
void main(){
  // 木纹（白天）/ 深色哑光（夜晚）
  vec3 base = uBaseColor;
  if(uIsNight < 0.5){
    float grain = vnoise(vec2(vWorld.x*3.0, vWorld.z*24.0))*0.12
                + vnoise(vec2(vWorld.x*0.8, vWorld.z*3.0))*0.08;
    base *= 1.0 - grain;
  }
  float dist = length(vWorld.xz);
  // 烛下假阴影
  float shadow = 1.0 - 0.55*(1.0 - smoothstep(0.35, 1.1, dist));
  vec3 col = base * uAmbient * shadow;
  // 火焰在桌面投出的暖色光池，随熔池扩大
  vec3 toF = uFlamePos - vWorld;
  float d = length(toF);
  float pool = uLit * uFlameI * (0.6 + 0.8*uMeltGlow) / (1.0 + 9.0*d*d);
  col += uFlameColor * pool * base * 2.2;
  // 远处渐暗（夜晚压暗四角）
  col *= 1.0 - uIsNight*0.75*smoothstep(1.2, 4.5, dist);
  col = tonemap(col);
  outColor = vec4(col, 1.0);
}`;

// ---------------- 干花（实例化） ----------------

export const FLOWER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;      // -1..1 四边形
layout(location=1) in vec3 iOffset;
layout(location=2) in vec3 iRot;         // 欧拉角（简化）
layout(location=3) in float iScale;
layout(location=4) in float iHue;
uniform mat4 uProj, uView;
out vec2 vUv; out float vHue; out vec3 vWorld;
mat3 euler(vec3 e){
  float cx=cos(e.x), sx=sin(e.x), cy=cos(e.y), sy=sin(e.y), cz=cos(e.z), sz=sin(e.z);
  mat3 rx = mat3(1,0,0, 0,cx,sx, 0,-sx,cx);
  mat3 ry = mat3(cy,0,-sy, 0,1,0, sy,0,cy);
  mat3 rz = mat3(cz,sz,0, -sz,cz,0, 0,0,1);
  return ry*rx*rz;
}
void main(){
  vUv = aCorner*0.5 + 0.5;
  vHue = iHue;
  vec3 p = euler(iRot) * vec3(aCorner*iScale, 0.0) + iOffset;
  vWorld = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const FLOWER_FS = `#version 300 es
precision highp float;
in vec2 vUv; in float vHue; in vec3 vWorld;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAmbient;
uniform vec3 uFlamePos;
uniform float uFlameI;
uniform vec3 uFlameColor;
uniform float uLit;
out vec4 outColor;
${NOISE}
${TONEMAP}
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float petals = 6.0 + floor(vHue*3.0);
  // 花瓣轮廓：半径随角度调制
  float mod_ = 0.62 + 0.38*abs(cos(a*petals*0.5));
  float edge = r / mod_;
  float alpha = 1.0 - smoothstep(0.82, 0.98, edge);
  if(alpha < 0.03) discard;
  // 花瓣纹理：放射状色带 + 噪声干枯感
  float vein = 0.85 + 0.15*vnoise(vec2(a*4.0, r*9.0));
  float dry = vnoise(vUv*14.0 + vHue*37.0)*0.35;
  vec3 col = mix(uColorB, uColorA, smoothstep(0.12, 0.5, r)) * vein;
  col *= 1.0 - dry*0.5;
  // 花心
  col = mix(uColorB*1.15, col, smoothstep(0.10, 0.22, r));
  // 简单光照：环境 + 火焰暖光
  float d = distance(uFlamePos, vWorld);
  vec3 light = uAmbient*1.2 + uFlameColor * (uLit*uFlameI/(1.0+20.0*d*d));
  col = tonemap(col * light);
  outColor = vec4(col, alpha*0.96);
}`;

// ---------------- 火焰 ----------------

export const FLAME_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // x: -1..1, y: 0..1
uniform mat4 uProj, uView;
uniform vec3 uCenter;
uniform vec2 uSize;        // 宽、高
uniform float uWind;       // -1..1
uniform float uTime;
uniform float uSway;       // 随燃烧时间增强的晃动幅度
out vec2 vUv;
void main(){
  vUv = vec2(aCorner.x*0.5+0.5, aCorner.y);
  // 相机右方向做广告牌
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 p = uCenter + right * aCorner.x * uSize.x * 0.5;
  p.y += aCorner.y * uSize.y;
  // 风 + 晃动：越靠顶端偏移越大
  float t = aCorner.y;
  float sway = sin(uTime*2.1 + t*3.0)*0.5 + sin(uTime*3.7 + t*5.0)*0.3;
  p.x += (uWind*0.55 + sway*uSway*0.12) * t*t * uSize.y;
  p.z += sway*uSway*0.05 * t*t * uSize.y;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const FLAME_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uFlicker;   // 闪烁系数
uniform float uWind;
uniform int uOctaves;
uniform float uIntensity;
out vec4 outColor;
${NOISE}
void main(){
  vec2 uv = vUv;
  // 噪声扭曲，向上流动
  float n = fbm(vec2(uv.x*3.0, uv.y*2.2 - uTime*2.6), uOctaves);
  float x = (uv.x - 0.5) + (n - 0.5)*0.42*uv.y + uWind*0.22*uv.y*uv.y;
  // 泪滴形宽度
  float w = 0.34*sin(3.14159*pow(clamp(uv.y, 0.0, 1.0), 0.62));
  w *= 0.9 + 0.15*uFlicker;
  float body = 1.0 - smoothstep(w*0.35, w, abs(x));
  if(body < 0.004) discard;
  // 颜色：底部蓝 -> 橙 -> 亮黄核心
  float core = 1.0 - smoothstep(0.0, w*0.5, abs(x));
  vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.45), core*core);
  col = mix(col, vec3(1.0, 0.98, 0.85), pow(core, 4.0)*(1.0-uv.y));
  // 底部蓝焰
  float blue = (1.0 - smoothstep(0.0, 0.22, uv.y)) * (1.0 - smoothstep(w*0.6, w, abs(x)));
  col = mix(col, vec3(0.25, 0.45, 1.0), blue*0.7);
  float alpha = body * (0.85 + 0.15*uFlicker) * uIntensity;
  // 顶部渐隐
  alpha *= 1.0 - smoothstep(0.75, 1.0, uv.y);
  outColor = vec4(col * alpha * 1.6, alpha);
}`;

// ---------------- 光晕 ----------------

export const GLOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform mat4 uProj, uView;
uniform vec3 uCenter;
uniform float uRadius;
out vec2 vP;
void main(){
  vP = aCorner;
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up    = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 p = uCenter + (right*aCorner.x + up*aCorner.y) * uRadius;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec3 uColor;
uniform float uIntensity;
out vec4 outColor;
void main(){
  float r = length(vP);
  float g = exp(-r*r*4.5) * uIntensity;
  outColor = vec4(uColor * g, g);
}`;

// ---------------- 简单实体（烛芯等） ----------------

export const SOLID_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView;
out vec3 vWorld; out vec3 vNormal;
void main(){
  vWorld = aPos; vNormal = aNormal;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const SOLID_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uTipY;       // 烛芯顶端发光
uniform float uLit;
uniform vec3 uFlameColor;
uniform float uFlameI;
out vec4 outColor;
${TONEMAP}
void main(){
  vec3 n = normalize(vNormal);
  float ndl = clamp(dot(n, uKeyDir), 0.0, 1.0);
  vec3 col = uColor * (uAmbient + uKeyColor*ndl*0.6);
  // 燃烧点：靠近顶端发橙红光
  float tip = smoothstep(uTipY - 0.02, uTipY, vWorld.y);
  col += uFlameColor * tip * uLit * uFlameI * 1.4;
  outColor = vec4(tonemap(col), 1.0);
}`;
