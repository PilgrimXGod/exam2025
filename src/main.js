// Файл: src/main.js (Написано з нуля, найнадійніший варіант)

window.onload = () => {
    'use strict';

    // --- Перевірка завантаження бібліотек ---
    if (typeof THREE === 'undefined') {
        alert("Помилка: бібліотека Three.js не завантажилася!");
        return;
    }
    if (typeof THREE.GLTFLoader === 'undefined') {
        alert("Помилка: бібліотека GLTFLoader не завантажилася!");
        return;
    }
    if (typeof THREE.OrbitControls === 'undefined') {
        alert("Помилка: бібліотека OrbitControls не завантажилася!");
        return;
    }
    if (typeof tf === 'undefined') {
        alert("Помилка: бібліотека TensorFlow.js не завантажилася!");
        return;
    }
    console.log("Всі бібліотеки успішно завантажені.");

    // --- Глобальні змінні ---
    let scene, camera, renderer, controls;
    let serverRackModel = null;
    const containers = [];
    let mlModel = null;
    let simulationActive = false;
    let simulationTime = 0;
    const loadHistory = [];
    const LOAD_THRESHOLD = 0.75;

    // --- Елементи UI ---
    const simButton = document.getElementById('simulate-load-btn');
    const statusText = document.getElementById('status-text');
    const predictionText = document.getElementById('prediction-text');

    // --- Основна функція ---
    async function main() {
        // Сцена
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333333);
        scene.fog = new THREE.Fog(0x333333, 10, 40);

        // Камера
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 6);

        // Світло
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        // Рендерер
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Керування
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1, 0);
        controls.enableDamping = true;

        // Допоміжна сітка
        const grid = new THREE.GridHelper(20, 20, 0x555555, 0x555555);
        scene.add(grid);

        // Запуск логіки
        statusText.textContent = "Тренування ML-моделі...";
        await createAndTrainModel();
        
        statusText.textContent = "Завантаження 3D-моделей...";
        await placeScene();

        // Обробники подій
        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
        };
        window.addEventListener('resize', onWindowResize);

        // Головний цикл
        animate();
    }

    // --- Допоміжні функції ---
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        handleSimulation();
        renderer.render(scene, camera);
    }

    // --- Логіка завантаження моделей ---
    function placeScene() {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(
                './assets/models/server_rack.gltf',
                (gltf) => {
                    console.log("Серверна стійка завантажена.");
                    serverRackModel = gltf.scene;
                    
                    // Застосовуємо простий матеріал
                    serverRackModel.traverse(child => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshStandardMaterial({ color: 0x888888 });
                        }
                    });
                    
                    serverRackModel.position.set(0, 1, 0);
                    scene.add(serverRackModel);
                    
                    addContainers(3).then(resolve);
                },
                undefined,
                (error) => {
                    console.error("Помилка завантаження серверної стійки:", error);
                    statusText.textContent = "Помилка завантаження моделі!";
                    reject(error);
                }
            );
        });
    }

    function addContainers(count) {
        return new Promise((resolve) => {
            if (!serverRackModel) return resolve();
            const loader = new THREE.GLTFLoader();
            loader.load(
                './assets/models/docker_whale.gltf',
                (gltf) => {
                    console.log("Модель кита завантажена.");
                    for (let i = 0; i < count; i++) {
                        const container = gltf.scene.clone();
                        const angle = (containers.length / 10) * Math.PI * 2;
                        const radius = 1.5;
                        
                        container.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);
                        container.scale.set(0.05, 0.05, 0.05);

                        // Застосовуємо простий матеріал
                        container.traverse(child => {
                            if (child.isMesh) {
                                child.material = new THREE.MeshStandardMaterial({ color: 0x0db7ed });
                            }
                        });

                        scene.add(container);
                        containers.push(container);
                    }
                    statusText.textContent = "Готово до симуляції.";
                    resolve();
                },
                undefined,
                (error) => {
                    console.error("Помилка завантаження моделі кита:", error);
                    resolve(); // Продовжуємо роботу, навіть якщо кити не завантажились
                }
            );
        });
    }

    // --- Логіка ML та симуляції ---
    async function createAndTrainModel() {
        let model = tf.sequential();
        model.add(tf.layers.lstm({ units: 16, inputShape: [10, 1] }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
        const data = Array.from({length: 200}, (_, i) => Math.sin(i / 15) * 0.5 + 0.5);
        const xs_data = [], ys_data = [];
        for (let i = 0; i < data.length - 10; i++) {
            xs_data.push(data.slice(i, i + 10));
            ys_data.push(data[i + 10]);
        }
        const xs = tf.tensor2d(xs_data);
        const ys = tf.tensor1d(ys_data);
        const xs_reshaped = xs.reshape([xs.shape[0], xs.shape[1], 1]);
        await model.fit(xs_reshaped, ys, { epochs: 40 });
        console.log("ML-модель успішно натренована!");
        xs.dispose(); ys.dispose(); xs_reshaped.dispose();
        mlModel = model;
    }

    async function handleSimulation() {
        if (!simulationActive) return;
        simulationTime += 0.05;
        const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5;
        statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
        loadHistory.push(currentLoad);
        if (loadHistory.length > 10) { loadHistory.shift(); }
        if (loadHistory.length === 10) {
            const prediction = await predictLoad(loadHistory);
            predictionText.textContent = prediction.toFixed(2);
            if (prediction > LOAD_THRESHOLD && containers.length < 30) {
                statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
                addContainers(1);
                simulationTime += Math.PI;
            }
        }
    }
    
    async function predictLoad(sequence) {
        if (!mlModel) return null;
        return tf.tidy(() => {
            const input = tf.tensor2d([sequence]).reshape([1, 10, 1]);
            const prediction = mlModel.predict(input);
            return prediction.dataSync()[0];
        });
    }

    // Запуск всього додатку
    main();
};