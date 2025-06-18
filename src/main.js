// Файл: src/main.js (ФІНАЛЬНА ВЕРСІЯ з ручним керуванням циклом рендерингу WebXR)

import { createAndTrainModel, predictLoad } from './ml/scaling-model.js';

// --- Глобальні змінні ---
let scene, camera, renderer;
let serverRackModel = null, containers = [];
let mlModel, simulationActive = false, simulationTime = 0;
const LOAD_THRESHOLD = 0.75;
let loadHistory = [];
let xrSession = null; // Зберігаємо сесію тут
let xrReferenceSpace = null; // Зберігаємо систему координат

// --- Елементи UI ---
const arButton = document.getElementById('ar-button');
const uiContainer = document.getElementById('ui-container');
const simButton = document.getElementById('simulate-load-btn');
const statusText = document.getElementById('status-text');
const predictionText = document.getElementById('prediction-text');

// --- Ініціалізація ---
init();

async function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    scene.add(light);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(dirLight);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // ВАЖЛИВО: Ми вмикаємо XR, але не будемо використовувати setSession
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    arButton.onclick = async () => {
        if (xrSession) {
            await xrSession.end();
        } else {
            startAR();
        }
    };
}

async function startAR() {
    if (navigator.xr) {
        try {
            // Запитуємо сесію напряму через WebXR API
            xrSession = await navigator.xr.requestSession('immersive-ar', {
                // Запитуємо 'local-floor' або 'local'. Це більш сумісні типи.
                requiredFeatures: ['local'] 
            });

            onSessionStarted();

            // Встановлюємо шар для рендерингу
            const glLayer = new XRWebGLLayer(xrSession, renderer.getContext());
            xrSession.updateRenderState({ baseLayer: glLayer });
            
            // Отримуємо систему координат
            xrReferenceSpace = await xrSession.requestReferenceSpace('local');

            // Запускаємо наш власний цикл рендерингу
            xrSession.requestAnimationFrame(onXRFrame);

        } catch (e) {
            console.error("Не вдалося запустити AR сесію:", e);
            alert("Помилка запуску AR. Можливо, ваш пристрій не підтримує WebXR 'local' space.");
        }
    } else {
        alert("WebXR не підтримується на цьому пристрої/браузері.");
    }
}

function onSessionStarted() {
    arButton.textContent = "Exit AR";
    uiContainer.style.display = 'block';

    simButton.onclick = () => {
        simulationActive = !simulationActive;
        simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
    };
    
    statusText.textContent = "Тренування ML-моделі...";
    createAndTrainModel().then(trainedModel => {
        mlModel = trainedModel;
        placeSceneInFrontOfCamera();
    });

    xrSession.addEventListener('end', onSessionEnded);
}

function onSessionEnded() {
    arButton.textContent = "Увійти в AR";
    uiContainer.style.display = 'none';
    xrSession = null;
    
    if (serverRackModel) scene.remove(serverRackModel);
    containers.forEach(c => scene.remove(c));
    serverRackModel = null;
    containers = [];
    simulationActive = false;
}

// ЦЕ НАШ НОВИЙ ГОЛОВНИЙ ЦИКЛ РЕНДЕРИНГУ
function onXRFrame(time, frame) {
    // Отримуємо наступний кадр
    const session = frame.session;
    session.requestAnimationFrame(onXRFrame);

    // Отримуємо позицію та орієнтацію глядача (камери)
    const pose = frame.getViewerPose(xrReferenceSpace);

    if (pose) {
        // Оновлюємо сцену Three.js вручну
        const glLayer = session.renderState.baseLayer;
        renderer.getContext().bindFramebuffer(glLayer.framebuffer, glLayer.framebuffer);
        
        // Оновлюємо камери сцени на основі даних WebXR
        for (const view of pose.views) {
            const viewport = glLayer.getViewport(view);
            renderer.setSize(viewport.width, viewport.height);

            camera.matrix.fromArray(view.transform.matrix);
            camera.projectionMatrix.fromArray(view.projectionMatrix);
            camera.updateMatrixWorld(true);
            
            // Обробока симуляції
            handleSimulation();

            // Рендеримо сцену
            renderer.render(scene, camera);
        }
    }
}


function placeSceneInFrontOfCamera() {
    statusText.textContent = "Завантаження 3D-моделей...";
    
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/models/server_rack.glb', (gltf) => {
        serverRackModel = gltf.scene;
        serverRackModel.position.set(0, -0.5, -1.5); 
        serverRackModel.scale.set(0.15, 0.15, 0.15);
        scene.add(serverRackModel);
        addContainers(3);
    }, undefined, (error) => {
        console.error("Помилка завантаження моделі стійки:", error);
    });
}

function addContainers(count) {
    if (!serverRackModel) return;
    
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/models/docker_whale.glb', (gltf) => {
        for (let i = 0; i < count; i++) {
            const container = gltf.scene.clone();
            container.scale.set(0.05, 0.05, 0.05);
            
            const angle = (containers.length / 10) * Math.PI * 2;
            const radius = 0.5;
            container.position.set(
                serverRackModel.position.x + Math.cos(angle) * radius,
                serverRackModel.position.y + 0.3 + Math.sin(angle * 2) * 0.1,
                serverRackModel.position.z + Math.sin(angle) * radius
            );
            scene.add(container);
            containers.push(container);
        }
        statusText.textContent = "Готово до симуляції.";
    });
}

async function handleSimulation() {
    if (!simulationActive || !serverRackModel || !mlModel) return;

    simulationTime += 0.05;
    const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5;
    statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
    
    loadHistory.push(currentLoad);
    if (loadHistory.length > 10) loadHistory.shift();
    
    const prediction = await predictLoad(loadHistory);
    if (prediction !== null) {
        predictionText.textContent = prediction.toFixed(2);
        if (prediction > LOAD_THRESHOLD && containers.length < 15) {
            statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
            addContainers(1);
            simulationTime += Math.PI;
        }
    }
}