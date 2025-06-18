// Файл: src/main.js
import { createAndTrainModel, predictLoad } from './ml/scaling-model.js';

// --- Глобальні змінні ---
let scene, camera, renderer;
let serverRackModel = null, containers = [];
let mlModel, simulationActive = false, simulationTime = 0;
const LOAD_THRESHOLD = 0.75;
let loadHistory = [];

// --- Елементи UI ---
const uiContainer = document.getElementById('ui-container');
const simButton = document.getElementById('simulate-load-btn');
const statusText = document.getElementById('status-text');
const predictionText = document.getElementById('prediction-text');

init();

async function init() {
    // 1. Налаштування сцени та камери
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Додаємо освітлення для кращого вигляду моделей
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2);
    scene.add(light);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(dirLight);

    // 2. Налаштування рендерера
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // Вмикаємо WebXR
    document.body.appendChild(renderer.domElement);

    // 3. Запуск камери на фоні
    try {
        // Запитуємо доступ до задньої камери
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.getElementById('video-background');
        video.srcObject = stream;
        video.play();
    } catch (e) {
        console.error("Не вдалося отримати доступ до камери:", e);
        alert("Помилка доступу до камери. Будь ласка, надайте дозвіл.");
    }

    // 4. Запуск WebXR сесії в режимі 'inline'
    if (navigator.xr) {
        try {
            // Запитуємо 'inline' сесію. Вона використовує гіроскоп, але не викликає помилку.
            const session = await navigator.xr.requestSession('inline');
            renderer.xr.setSession(session);
        } catch(e) {
            console.error("Не вдалося запустити WebXR в inline режимі:", e);
            alert("Не вдалося запустити WebXR в inline режимі.");
        }
    } else {
        alert("WebXR не підтримується на цьому пристрої.");
    }
    
    // 5. Запуск логіки проєкту
    statusText.textContent = "Тренування ML-моделі...";
    createAndTrainModel().then(trainedModel => {
        mlModel = trainedModel;
        placeSceneInFrontOfCamera();
    });

    simButton.onclick = () => {
        simulationActive = !simulationActive;
        simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
    };
    
    // 6. Запуск циклу рендерингу
    renderer.setAnimationLoop(render);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function placeSceneInFrontOfCamera() {
    statusText.textContent = "Завантаження 3D-моделей...";
    
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/models/server_rack.glb', (gltf) => {
        serverRackModel = gltf.scene;
        // Розміщуємо сцену перед користувачем (у локальних координатах)
        serverRackModel.position.set(0, -0.3, -1.5);
        serverRackModel.scale.set(0.1, 0.1, 0.1);
        scene.add(serverRackModel);
        
        // Додаємо початкові контейнери
        addContainers(3);
    }, undefined, (error) => {
        console.error("Помилка завантаження моделі стійки:", error);
        statusText.textContent = "Помилка завантаження моделі.";
    });
}

function addContainers(count) {
    if (!serverRackModel) return;
    
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/models/docker_whale.glb', (gltf) => {
        for (let i = 0; i < count; i++) {
            const container = gltf.scene.clone();
            const angle = (containers.length / 10) * Math.PI * 2;
            const radius = 0.4;

            // Створюємо батьківський об'єкт для контейнерів, щоб вони обертались разом зі стійкою
            const containerGroup = new THREE.Group();
            serverRackModel.add(containerGroup); // Додаємо до стійки
            
            // Позиціонуємо контейнер відносно стійки
            container.position.set(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius);
            container.scale.set(0.3, 0.3, 0.3); // Збільшимо розмір контейнерів
            
            containerGroup.add(container);
            containers.push(containerGroup);
        }
        statusText.textContent = "Готово до симуляції.";
    }, undefined, (error) => {
        console.error("Помилка завантаження моделі кита:", error);
    });
}

async function handleSimulation() {
    if (!simulationActive || !serverRackModel || !mlModel) return;

    simulationTime += 0.05;
    const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5;
    statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
    
    loadHistory.push(currentLoad);
    if (loadHistory.length > 10) {
        loadHistory.shift();
    }
    
    const prediction = await predictLoad(loadHistory);
    if (prediction !== null) {
        predictionText.textContent = prediction.toFixed(2);
        if (prediction > LOAD_THRESHOLD && containers.length < 15) {
            statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
            addContainers(1);
            simulationTime += Math.PI; // Скидаємо цикл, щоб не спамити
        }
    }
}

function render() {
    // WebXR в режимі 'inline' автоматично оновлює позицію камери на основі даних гіроскопа
    handleSimulation();
    renderer.render(scene, camera);
}