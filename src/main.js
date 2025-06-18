// Файл: src/main.js (ФІНАЛЬНА ВЕРСІЯ для безмаркерної AR без прив'язки до поверхонь)

import { createAndTrainModel, predictLoad } from './ml/scaling-model.js';

console.log("Скрипт main.js завантажено.");

// --- Глобальні змінні ---
let scene, camera, renderer;
let serverRackModel = null; // 3D-модель серверної стійки
let containers = [];        // Масив для 3D-моделей контейнерів
let mlModel;                // Наша ML-модель
const LOAD_THRESHOLD = 0.75;  // Поріг для масштабування
let loadHistory = [];
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
    console.log("init() викликано");
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Додаємо освітлення для реалістичності моделей
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 10, 0);
    scene.add(dirLight);
    
    // Налаштовуємо рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Обробник кнопки для старту AR
    arButton.onclick = async () => {
        console.log("Натиснуто кнопку 'Увійти в AR'");
        if (navigator.xr) {
            try {
                // Запитуємо базову сесію 'immersive-ar', яка не потребує прив'язки до світу
                const session = await navigator.xr.requestSession('immersive-ar');
                console.log("AR-сесію успішно отримано.");
                renderer.xr.setSession(session);
            } catch (e) {
                console.error("Не вдалося запустити AR сесію:", e);
                alert("Помилка запуску AR. Можливо, ваш пристрій не підтримує WebXR.");
            }
        } else {
            alert("WebXR не підтримується на цьому пристрої/браузері.");
        }
    };
    
    // Встановлюємо слухача на старт сесії
    renderer.xr.addEventListener('sessionstart', onSessionStarted);
    // Встановлюємо слухача на кінець сесії
    renderer.xr.addEventListener('sessionend', onSessionEnded);

    renderer.setAnimationLoop(render);
}

function onSessionStarted(event) {
    console.log("onSessionStarted() викликано.");
    arButton.style.display = 'none';
    uiContainer.style.display = 'block';

    simButton.onclick = () => {
        simulationActive = !simulationActive;
        simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
    };
    
    statusText.textContent = "Тренування ML-моделі...";
    createAndTrainModel().then(trainedModel => {
        mlModel = trainedModel;
        console.log("ML-модель натренована. Розміщуємо сцену.");
        placeSceneInFrontOfCamera(); // Розміщуємо сцену автоматично
    });
}

function onSessionEnded(event) {
    console.log("AR-сесію завершено.");
    arButton.style.display = 'block';
    uiContainer.style.display = 'none';
    
    // Повністю очищуємо сцену при виході з AR
    if (serverRackModel) {
        scene.remove(serverRackModel);
        serverRackModel = null;
    }
    containers.forEach(c => scene.remove(c));
    containers = [];
    simulationActive = false;
}

function placeSceneInFrontOfCamera() {
    console.log("Розміщуємо сцену перед камерою.");
    statusText.textContent = "Завантаження 3D-моделей...";
    
    const loader = new THREE.GLTFLoader();
    loader.load(
        './assets/models/server_rack.glb',
        (gltf) => {
            console.log("Модель server_rack.glb успішно завантажено.");
            serverRackModel = gltf.scene;
            
            // Розміщуємо модель на відстані 1.5 метра перед користувачем
            serverRackModel.position.set(0, -0.5, -1.5); 
            serverRackModel.scale.set(0.15, 0.15, 0.15);
            scene.add(serverRackModel);
            
            addContainers(3); // Додаємо початкові контейнери
        },
        undefined,
        (error) => {
            console.error("Помилка завантаження моделі стійки:", error);
            statusText.textContent = "Помилка завантаження моделі.";
        }
    );
}

function addContainers(count) {
    if (!serverRackModel) return; // Захист від помилки, якщо основна модель не завантажилась
    
    const loader = new THREE.GLTFLoader();
    loader.load(
        './assets/models/docker_whale.glb',
        (gltf) => {
            for (let i = 0; i < count; i++) {
                const container = gltf.scene.clone();
                container.scale.set(0.05, 0.05, 0.05);
                
                const angle = (containers.length / 10) * Math.PI * 2;
                const radius = 0.5;
                // Позиціонуємо відносно головної моделі
                container.position.set(
                    serverRackModel.position.x + Math.cos(angle) * radius,
                    serverRackModel.position.y + 0.3 + Math.sin(angle * 2) * 0.1, // додамо трохи коливань по висоті
                    serverRackModel.position.z + Math.sin(angle) * radius
                );
                scene.add(container);
                containers.push(container);
            }
            statusText.textContent = "Готово до симуляції.";
        },
        undefined,
        (error) => {
            console.error("Помилка завантаження моделі кита:", error);
        }
    );
}

async function handleSimulation() {
    if (!simulationActive || !serverRackModel || !mlModel) return;

    // Симуляція навантаження
    simulationTime += 0.05;
    const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5;
    statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
    
    loadHistory.push(currentLoad);
    if (loadHistory.length > 10) loadHistory.shift();
    
    // Прогноз та масштабування
    const prediction = await predictLoad(loadHistory);
    if (prediction !== null) {
        predictionText.textContent = prediction.toFixed(2);
        if (prediction > LOAD_THRESHOLD && containers.length < 15) {
            statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
            addContainers(1);
            simulationTime += Math.PI; // Скидаємо цикл, щоб не спамити контейнерами
        }
    }
}

// Головний цикл рендерингу
function render() {
    // Вся магія відбувається в сесії WebXR, нам не потрібно тут нічого змінювати
    handleSimulation();
    renderer.render(scene, camera);
}