export const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
uniform int u_max_iterations;
uniform int u_fractal_type;     // 0: Mandelbrot, 1: Julia, 2: Burning Ship, 3: Tricorn
uniform vec2 u_julia_c;
uniform float u_escape_radius_sq;
uniform int u_smooth_coloring;  // 0: discrete, 1: smooth
uniform int u_palette;          // 0 to 5
uniform float u_time;
uniform float u_palette_speed;

// Cosine based palette generator (Inigo Quilez)
vec3 paletteCosine(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.2831853 * (c * t + d));
}

vec3 getColor(float iter, float maxIter) {
  if (iter >= maxIter) {
    return vec3(0.01, 0.015, 0.03); // Deep interior black
  }

  // Normalized time with palette cycling animation
  float t = iter / 32.0 + u_time * u_palette_speed;

  vec3 col = vec3(0.0);

  if (u_palette == 0) {
    // Electric Cosmic (Cyan, Violet, Electric Blue)
    col = paletteCosine(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  } else if (u_palette == 1) {
    // Sunset Magma (Dark purple, Crimson, Fire Orange, Gold)
    col = paletteCosine(t, vec3(0.5, 0.4, 0.2), vec3(0.5, 0.4, 0.3), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.9, 0.3));
  } else if (u_palette == 2) {
    // Cyberpunk Neon (Magenta, Laser Cyan, Violet)
    col = paletteCosine(t, vec3(0.8, 0.5, 0.4), vec3(0.2, 0.4, 0.2), vec3(2.0, 1.0, 1.0), vec3(0.0, 0.25, 0.25));
  } else if (u_palette == 3) {
    // Emerald Abyss (Deep teal, Jade, Mint)
    col = paletteCosine(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.3, 0.20, 0.8));
  } else if (u_palette == 4) {
    // Psychedelic Rainbow
    col = paletteCosine(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.1, 0.2));
  } else {
    // Monochrome Platinum
    float v = 0.5 + 0.5 * cos(6.2831853 * t);
    col = vec3(v * 0.95);
  }

  return col;
}

void main() {
  // Aspect-corrected coordinate mapping
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Map to complex plane: z = center + st / zoom
  vec2 coord = u_center + st / u_zoom;

  vec2 z;
  vec2 c;

  if (u_fractal_type == 1) {
    // Julia Set: z starts at coordinate, c is fixed
    z = coord;
    c = u_julia_c;
  } else if (u_fractal_type == 2) {
    // Burning Ship: z starts at 0, c has inverted y so the ship and masts rise upright
    z = vec2(0.0);
    c = vec2(coord.x, -coord.y);
  } else {
    // Mandelbrot, Tricorn: z starts at 0, c is coordinate
    z = vec2(0.0);
    c = coord;
  }

  int escapedAt = u_max_iterations;
  float finalAbsSq = 0.0;

  for (int i = 0; i < 2000; i++) {
    if (i >= u_max_iterations) break;

    // Fast check for divergence
    float zDot = dot(z, z);
    if (zDot > u_escape_radius_sq) {
      escapedAt = i;
      finalAbsSq = zDot;
      break;
    }

    // Fractal iteration formulas
    if (u_fractal_type == 0) {
      // Mandelbrot: z = z^2 + c
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    } else if (u_fractal_type == 1) {
      // Julia: z = z^2 + c
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    } else if (u_fractal_type == 2) {
      // Burning Ship: z = (|Re(z)| + i|Im(z)|)^2 + c
      // (|x| + i|y|)^2 = x^2 - y^2 + 2i|x||y|
      vec2 absZ = abs(z);
      z = vec2(absZ.x * absZ.x - absZ.y * absZ.y, 2.0 * absZ.x * absZ.y) + c;
    } else if (u_fractal_type == 3) {
      // Tricorn: z = (conj(z))^2 + c = (x - iy)^2 + c
      z = vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;
    }
  }

  float smoothIter = float(escapedAt);

  if (escapedAt < u_max_iterations && u_smooth_coloring == 1) {
    // Continuous smooth coloring formula
    // nu = i + 1 - log(log(|z|)) / log(2)
    // with |z|^2 = finalAbsSq -> log(|z|) = 0.5 * log(|z|^2)
    float logZn = log(max(finalAbsSq, 1.0)) * 0.5;
    float nu = log(max(logZn / 0.69314718, 0.0001)) / 0.69314718;
    smoothIter = float(escapedAt) + 1.0 - nu;
  }

  vec3 color = getColor(smoothIter, float(u_max_iterations));
  fragColor = vec4(color, 1.0);
}
`;
