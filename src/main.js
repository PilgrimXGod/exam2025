// Файл: src/main.js

// Імпортуємо функції з нашого ML-модуля
import { createAndTrainModel, predictLoad } from './ml/scaling-model.js';

// --- Глобальні змінні ---
let scene, camera, renderer, controller;
let reticle; // Об'єкт-індикатор для розміщення на поверхні
let hitTestSource = null;
let hitTestSourceRequested = false;

let serverRackModel = null; // Наша основна 3D-модель (серверна стійка)
let containers = []; // Масив для 3D-моделей контейнерів

let mlModel; // Тут буде зберігатись наша натренована модель
const LOAD_THRESHOLD = 0.75; // Поріг навантаження для масштабування
let loadHistory = []; // Історія значень навантаження для прогнозу
let simulationActive = false;
let simulationTime = 0;

// --- Елементи UI ---
const arButton = document.getElementById('ar-button');
const uiContainer = document.getElementById('ui-container');
const simButton = document.getElementById('simulate-load-btn');
const statusText = document.getElementById('status-text');
const predictionText = document.getElementById('prediction-text');

// --- Ініціалізація ---
init();

async function init() {
    // Створення сцени
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xabcdef); // Додай цей рядок
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Додаємо м'яке освітлення
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);
    
    // Налаштування рендерера
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); // Тимчасово прибрали alpha
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // Вмикаємо підтримку WebXR
    document.body.appendChild(renderer.domElement);
    
    // Обробник кнопки входу в AR
    arButton.onclick = async () => {
        if (navigator.xr) {
            try {
                const session = await navigator.xr.requestSession('immersive-ar', { 
                    requiredFeatures: ['hit-test'] // Запитуємо функцію пошуку поверхонь
                });
                renderer.xr.setSession(session);
                onSessionStarted();
            } catch (e) {
                console.error("Не вдалося запустити AR сесію:", e);
                alert("Не вдалося запустити AR. Переконайтесь, що ваш пристрій підтримує ARCore/WebXR.");
            }
        }
    };
    
    // Головний цикл рендерингу
    renderer.setAnimationLoop(render);
}

function onSessionStarted() {
    arButton.style.display = 'none'; // Ховаємо кнопку входу
    uiContainer.style.display = 'block'; // Показуємо UI симуляції

    // Контролер для взаємодії (тап по екрану)
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Створюємо індикатор поверхні (reticle)
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Кнопка симуляції
    simButton.onclick = () => {
        simulationActive = !simulationActive;
        simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
        if (!simulationActive) {
            statusText.textContent = "Готово до симуляції";
            predictionText.textContent = "-";
        }
    };
    
    // Починаємо тренування ML-моделі у фоні
    statusText.textContent = "Тренування ML-моделі...";
    createAndTrainModel().then(trainedModel => {
        mlModel = trainedModel;
        statusText.textContent = "Готово. Знайдіть поверхню.";
    });
}


function onSelect() {
    // Розміщуємо модель, якщо індикатор видимий і модель ще не розміщена
    if (reticle.visible && !serverRackModel) {
        statusText.textContent = "Завантаження моделей...";
        const loader = new THREE.GLTFLoader();
        
        loader.load('assets/models/server_rack.glb', (gltf) => {
            serverRackModel = gltf.scene;
            serverRackModel.position.setFromMatrixPosition(reticle.matrix);
            serverRackModel.scale.set(0.15, 0.15, 0.15); // Масштабуємо за потреби
            scene.add(serverRackModel);

            // Після розміщення додаємо початкові контейнери
            addContainers(3);
            statusText.textContent = "Модель розміщено. Починайте симуляцію.";
        }, undefined, (error) => {
            console.error("Помилка завантаження моделі стійки:", error);
            statusText.textContent = "Помилка завантаження моделі.";
        });
    }
}

function addContainers(count) {
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/docker_whale.glb', (gltf) => {
        for (let i = 0; i < count; i++) {
            const container = gltf.scene.clone();
            container.scale.set(0.05, 0.05, 0.05);
            
            // Розміщуємо контейнери по колу навколо основної моделі
            const angle = (containers.length / 8) * Math.PI * 2;
            const radius = 0.4;
            container.position.set(
                serverRackModel.position.x + Math.cos(angle) * radius,
                serverRackModel.position.y + 0.3,
                serverRackModel.position.z + Math.sin(angle) * radius
            );
            scene.add(container);
            containers.push(container);
        }
    });
}

async function handleSimulation() {
    if (!simulationActive || !serverRackModel || !mlModel) return;

    // Симулюємо зміну навантаження
    simulationTime += 0.05;
    const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5; // Значення від 0 до 1
    statusText.textContent = `Поточне навантаження: ${currentLoad.toFixed(2)}`;
    
    loadHistory.push(currentLoad);
    if (loadHistory.length > 10) {
        loadHistory.shift(); // Зберігаємо тільки 10 останніх значень
    }

    // Робимо прогноз, коли назбирали достатньо історії
    const prediction = await predictLoad(loadHistory);
    if (prediction !== null) {
        predictionText.textContent = prediction.toFixed(2);
        
        // --- КЛЮЧОВА ЛОГІКА ---
        // Якщо модель прогнозує високе навантаження, і контейнерів ще не максимум
        if (prediction > LOAD_THRESHOLD && containers.length < 15) {
            statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
            addContainers(1); // Додаємо один контейнер
            // "Обнуляємо" час, щоб не додавати контейнери постійно
            simulationTime += Math.PI; 
        }
    }
}

function render(timestamp, frame) {
    // Код для пошуку поверхонь (hit-test)
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((refSpace) => {
                session.requestHitTestSource({ space: refSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }
    
    // Обробляємо логіку симуляції в кожному кадрі
    handleSimulation();

    // Рендеримо сцену
    renderer.render(scene, camera);
}