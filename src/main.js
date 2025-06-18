// Файл: src/main.js (ОНОВЛЕНА ВЕРСІЯ З ДЕБАГГІНГОМ)

import { createAndTrainModel, predictLoad } from './ml/scaling-model.js';

console.log("Скрипт main.js завантажено.");

// --- Глобальні змінні ---
let scene, camera, renderer, controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let serverRackModel = null;
let containers = [];
let mlModel;
const LOAD_THRESHOLD = 0.75;
let loadHistory = [];
let simulationActive = false;
let simulationTime = 0;

// --- Елементи UI ---
const arButton = document.getElementById('ar-button');
const uiContainer = document.getElementById('ui-container');
const simButton = document.getElementById('simulate-load-btn');
const statusText = document.getElementById('status-text');
const predictionText = document.getElementById('prediction-text');

init();

async function init() {
    console.log("init() викликано");
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    arButton.onclick = async () => {
        console.log("Натиснуто кнопку 'Увійти в AR'");
        if (navigator.xr) {
            try {
                const session = await navigator.xr.requestSession('immersive-ar', { 
                    requiredFeatures: ['hit-test']
                });
                console.log("AR-сесію успішно отримано.");
                renderer.xr.setSession(session);
                onSessionStarted(session); // Передаємо сесію
            } catch (e) {
                console.error("Не вдалося запустити AR сесію:", e);
                alert("Помилка запуску AR. Перевірте консоль для деталей.");
            }
        } else {
            console.error("WebXR не підтримується на цьому пристрої/браузері.");
            alert("WebXR не підтримується на цьому пристрої/браузері.");
        }
    };
    
    renderer.setAnimationLoop(render);
    console.log("init() завершено. Чекаємо на дії користувача.");
}

function onSessionStarted(session) {
    console.log("onSessionStarted() викликано.");
    arButton.style.display = 'none';
    uiContainer.style.display = 'block';

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    console.log("Індикатор (reticle) створено і додано на сцену.");

    simButton.onclick = () => {
        console.log("Кнопка симуляції натиснута. Новий стан:", !simulationActive);
        simulationActive = !simulationActive;
        simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
    };
    
    statusText.textContent = "Тренування ML-моделі...";
    createAndTrainModel().then(trainedModel => {
        mlModel = trainedModel;
        statusText.textContent = "Готово. Знайдіть поверхню.";
        console.log("ML-модель натренована. Очікуємо на пошук поверхні.");
    });

    session.addEventListener('end', onSessionEnded);
}

function onSessionEnded() {
    console.log("AR-сесію завершено.");
    arButton.style.display = 'block';
    uiContainer.style.display = 'none';
    hitTestSourceRequested = false;
    hitTestSource = null;
    // Очищуємо сцену від старих об'єктів
    if (serverRackModel) scene.remove(serverRackModel);
    containers.forEach(c => scene.remove(c));
    serverRackModel = null;
    containers = [];
}

function onSelect() {
    console.log("Зафіксовано подію 'select' (тап по екрану).");
    console.log(`Статус індикатора (reticle.visible): ${reticle.visible}`);
    console.log(`Статус моделі (serverRackModel): ${serverRackModel ? 'вже існує' : 'ще не існує'}`);

    // БІЛЬШ СУВОРА ПЕРЕВІРКА
    if (reticle.visible && !serverRackModel) {
        console.log("Умови для розміщення моделі виконано. Починаємо завантаження.");
        statusText.textContent = "Завантаження моделі...";
        
        const loader = new THREE.GLTFLoader();
        loader.load('assets/models/server_rack.glb', (gltf) => {
            console.log("Модель server_rack.glb успішно завантажено.");
            serverRackModel = gltf.scene;
            serverRackModel.position.setFromMatrixPosition(reticle.matrix);
            serverRackModel.scale.set(0.15, 0.15, 0.15);
            scene.add(serverRackModel);
            
            statusText.textContent = "Модель розміщено. Додаємо контейнери...";
            addContainers(3);
        }, undefined, (error) => {
            console.error("Помилка завантаження моделі стійки:", error);
            statusText.textContent = "Помилка завантаження моделі.";
        });
    } else {
        console.warn("Тап проігноровано: індикатор невидимий або модель вже розміщена.");
    }
}

function addContainers(count) {
    console.log(`Викликано addContainers з кількістю: ${count}`);
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/docker_whale.glb', (gltf) => {
        console.log("Модель docker_whale.glb успішно завантажено.");
        for (let i = 0; i < count; i++) {
            const container = gltf.scene.clone();
            container.scale.set(0.05, 0.05, 0.05);
            
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
        statusText.textContent = "Готово до симуляції.";
    }, undefined, (error) => {
        console.error("Помилка завантаження моделі кита:", error);
    });
}

async function handleSimulation() {
    // ... (код залишається без змін) ...
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

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            console.log("Запитуємо hit-test source...");
            session.requestReferenceSpace('viewer').then((refSpace) => {
                session.requestHitTestSource({ space: refSpace }).then((source) => {
                    hitTestSource = source;
                    console.log("Hit-test source успішно отримано.");
                });
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true; // Робимо індикатор видимим
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false; // Ховаємо, якщо поверхня не знайдена
            }
        }
    }
    
    handleSimulation();
    renderer.render(scene, camera);
}