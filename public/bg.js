(function(){
  const canvas = document.getElementById('bgCanvas');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl');

  if (!gl) { canvas.style.display = 'none'; return; }

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const vsSource = `
    attribute vec2 aPos;
    attribute float aPhase;
    uniform vec2 uMouse;
    uniform float uTime;
    varying float vAlpha;
    void main(){
      vec2 pos = aPos + uMouse * 0.015;
      float pulse = sin(uTime * 0.6 + aPhase) * 0.5 + 0.5;
      vAlpha = 0.15 + pulse * 0.35;
      gl_Position = vec4(pos, 0.0, 1.0);
      gl_PointSize = 2.0 + pulse * 2.0;
    }
  `;
  const fsSource = `
    precision mediump float;
    varying float vAlpha;
    void main(){
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      float edge = smoothstep(0.5, 0.0, d);
      vec3 color = vec3(0.910, 0.494, 0.576);
      gl_FragColor = vec4(color, edge * vAlpha);
    }
  `;

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  gl.useProgram(program);

  const cols = 40, rows = 24;
  const positions = [];
  const phases = [];
  for (let i = 0; i < cols; i++){
    for (let j = 0; j < rows; j++){
      positions.push((i / (cols - 1)) * 2 - 1, (j / (rows - 1)) * 2 - 1);
      phases.push(Math.random() * Math.PI * 2);
    }
  }

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const phaseBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(phases), gl.STATIC_DRAW);
  const aPhase = gl.getAttribLocation(program, 'aPhase');
  gl.enableVertexAttribArray(aPhase);
  gl.vertexAttribPointer(aPhase, 1, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 'uTime');
  const uMouse = gl.getUniformLocation(program, 'uMouse');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', e => {
    mouseX = (e.clientX / innerWidth) * 2 - 1;
    mouseY = -((e.clientY / innerHeight) * 2 - 1);
  });

  function frame(t){
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, t * 0.001);
    gl.uniform2f(uMouse, mouseX, mouseY);
    gl.drawArrays(gl.POINTS, 0, cols * rows);
    if (!prefersReduced) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (prefersReduced) frame(0);
})();