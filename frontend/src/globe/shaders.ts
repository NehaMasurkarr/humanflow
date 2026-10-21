export const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`
export const earthFragment = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float sun = dot(normal, sunDirection);
    float daylight = smoothstep(-0.15, 0.22, sun);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 surface = day * (0.22 + 0.88 * max(sun, 0.0));
    vec3 color = mix(night * 0.72 + day * 0.025, surface, daylight);
    float ocean = smoothstep(0.0, 0.12, day.b - day.r);
    float specular = pow(max(dot(reflect(-sunDirection, normal), viewDirection), 0.0), 42.0);
    color += vec3(0.34, 0.52, 0.65) * specular * ocean * daylight * 0.2;
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
    color += vec3(0.055, 0.27, 0.48) * rim * (0.15 + daylight * 0.6);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
export const atmosphereFragment = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDirection)), 3.5);
    gl_FragColor = vec4(0.12, 0.48, 0.9, rim * 0.23);
    #include <colorspace_fragment>
  }
`
