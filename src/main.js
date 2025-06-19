// Файл: src/main.js (Версія для завантаження .gltf, з window.onload та діагностикою)

// Ми чекаємо, поки ВСЯ сторінка, включаючи всі скрипти з <head>,
// повністю завантажиться. Тільки після цього наш код почне виконуватися.
window.onload = function() {
    'use strict';

    // ===============================================================
    // КОД ML-МОДЕЛІ
    // ===============================================================
    let mlModel;
    
    async function createAndTrainModel() {
        console.log("Починаємо створення та тренування ML-моделі...");
        let model = tf.sequential();
        model.add(tf.layers.lstm({ units: 16, inputShape: [10, 1] }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
        const data = [];
        for (let i = 0; i < 200; i++) {
            const value = Math.sin(i / 15) * 0.5 + 0.5 + (Math.random() - 0.5) * 0.1;
            data.push(Math.max(0, Math.min(1, value)));
        }
        const xs_data = [], ys_data = [];
        for (let i = 0; i < data.length - 10; i++) {
            xs_data.push(data.slice(i, i + 10));
            ys_data.push(data[i + 10]);
        }
        const xs = tf.tensor2d(xs_data);
        const ys = tf.tensor1d(ys_data);
        const xs_reshaped = xs.reshape([xs.shape[0], xs.shape[1], 1]);
        await model.fit(xs_reshaped, ys, {
            epochs: 40,
            callbacks: {
                onEpochEnd: (epoch, logs) => console.log(`Епоха ${epoch + 1}: Втрати = ${logs.loss.toFixed(4)}`)
            }
        });
        console.log("ML-модель успішно натренована!");
        xs.dispose(); 
        ys.dispose(); 
        xs_reshaped.dispose();
        mlModel = model;
    }

    async function predictLoad(sequence) {
        if (!mlModel) { throw new Error("Модель ще не натренована!"); }
        if (sequence.length !== 10) { return null; }
        return tf.tidy(() => {
            const input = tf.tensor2d([sequence]).reshape([1, 10, 1]);
            const prediction = mlModel.predict(input);
            return prediction.dataSync()[0];
        });
    }

    // ===============================================================
    // ОСНОВНИЙ КОД 3D-СЦЕНИ
    // ===============================================================
    let scene, camera, renderer, controls;
    let serverRackModel = null, containers = [];
    let simulationActive = false, simulationTime = 0;
    const LOAD_THRESHOLD = 0.75;
    let loadHistory = [];

    const uiContainer = document.getElementById('ui-container');
    const simButton = document.getElementById('simulate-load-btn');
    const statusText = document.getElementById('status-text');
    const predictionText = document.getElementById('prediction-text');

    async function main() {
        // --- Налаштування сцени ---
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xeeeeee);
        scene.fog = new THREE.Fog(0xeeeeee, 10, 50);

        // === ДІАГНОСТИКА: Додаємо сітку для орієнтації ===
        const gridHelper = new THREE.GridHelper( 10, 10, 0x888888, 0xcccccc );
        scene.add( gridHelper );
        // ================================================

        // --- Налаштування камери ---
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1, 4);

        // --- Налаштування світла ---
        const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        scene.add(light);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);

        // --- Налаштування рендерера ---
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        
        // --- Налаштування керування мишкою ---
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 0.5, 0);
        controls.update();

        // --- Запуск основної логіки ---
        statusText.textContent = "Тренування ML-моделі...";
        await createAndTrainModel();
        placeScene();

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

    function placeScene() {
        statusText.textContent = "Завантаження 3D-моделей...";
        const loader = new THREE.GLTFLoader();
        
        loader.load(
            // Шлях до .gltf файлу
            './assets/models/server_rack.gltf',
            
            // onLoad
            (gltf) => {
                console.log("Модель server_rack.gltf успішно завантажена!", gltf);
                statusText.textContent = "Модель завантажено, додаю на сцену...";
                serverRackModel = gltf.scene;
                
                // Спробуємо автоматично центрувати модель і підібрати масштаб
                const box = new THREE.Box3().setFromObject(serverRackModel);
                const center = box.getCenter(new THREE.Vector3());
                serverRackModel.position.sub(center); // центруємо модель
                
                scene.add(serverRackModel);

                // === ДОДАЙ ЦЕЙ РЯДОК ===
                serverRackModel.scale.set(0.5, 0.5, 0.5); // Встановимо початковий масштаб
                // ======================

                // === ДІАГНОСТИКА: Додаємо жовту рамку навколо моделі ===
                const boxHelper = new THREE.BoxHelper( serverRackModel, 0xffff00 );
                scene.add( boxHelper );
                // =======================================================

                addContainers(3);
            },
            
            // onProgress
            (xhr) => {
                const percentLoaded = (xhr.loaded / xhr.total * 100).toFixed(2);
                console.log(`Завантаження моделі: ${percentLoaded}%`);
                statusText.textContent = `Завантаження моделі: ${percentLoaded}%`;
            },
            
            // onError
            (error) => {
                console.error("Критична помилка під час завантаження моделі:", error);
                statusText.textContent = "Помилка завантаження моделі!";
            }
        );
    }

    function addContainers(count) {
        if (!serverRackModel) return;
        const loader = new THREE.GLTFLoader();
        // Завантажуємо модель кита
        loader.load('./assets/models/docker_whale.gltf', (gltf) => {
            for (let i = 0; i < count; i++) {
                const container = gltf.scene.clone();
                const angle = (containers.length / 10) * Math.PI * 2 + Math.random() * 0.5;
                const radius = 1.5 + Math.random() * 0.5; // Збільшимо радіус
                
                const containerGroup = new THREE.Group();
                serverRackModel.add(containerGroup);
                
                container.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
                
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
        if (loadHistory.length > 10) { loadHistory.shift(); }
        
        const prediction = await predictLoad(loadHistory);
        if (prediction !== null) {
            predictionText.textContent = prediction.toFixed(2);
            if (prediction > LOAD_THRESHOLD && containers.length < 20) {
                statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування!</b>`;
                addContainers(1);
                simulationTime += Math.PI;
            }
        }
    }

    function render() {
        controls.update();
        handleSimulation();
        renderer.render(scene, camera);
    }

    // Запускаємо наш основний код
    main();
};