// Файл: src/main.js

(function() { // Ізолюємо код, щоб не створювати глобальних змінних
    'use strict';

    // Отримуємо доступ до функцій через глобальний об'єкт
    const createAndTrainModel = window.MLUtils.createAndTrainModel;
    const predictLoad = window.MLUtils.predictLoad;

    // --- Глобальні змінні для цього скрипта ---
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
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 0.1;

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2);
        scene.add(light);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        scene.add(dirLight);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        document.body.appendChild(renderer.domElement);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            document.getElementById('video-background').srcObject = stream;
        } catch (e) {
            console.error("Не вдалося отримати доступ до камери:", e);
            alert("Помилка доступу до камери. Будь ласка, надайте дозвіл.");
        }

        if (navigator.xr) {
            try {
                const session = await navigator.xr.requestSession('inline');
                renderer.xr.setSession(session);
            } catch(e) {
                alert("Не вдалося запустити WebXR в inline режимі.");
            }
        } else {
            alert("WebXR не підтримується на цьому пристрої.");
        }
        
        statusText.textContent = "Тренування ML-моделі...";
        createAndTrainModel().then(trainedModel => {
            mlModel = trainedModel;
            placeSceneInFrontOfCamera();
        });

        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
        };
        
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
            serverRackModel.position.set(0, -0.3, -1.5);
            serverRackModel.scale.set(0.1, 0.1, 0.1);
            scene.add(serverRackModel);
            addContainers(3);
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
                const containerGroup = new THREE.Group();
                serverRackModel.add(containerGroup);
                container.position.set(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius);
                container.scale.set(0.3, 0.3, 0.3);
                containerGroup.add(container);
                containers.push(containerGroup);
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
        if (loadHistory.length > 10) { loadHistory.shift(); }
        
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

    function render() {
        handleSimulation();
        renderer.render(scene, camera);
    }

})();