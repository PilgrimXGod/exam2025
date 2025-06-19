// Файл: src/main.js (Версія з правильними шляхами до scene.gltf)

window.onload = () => {
    'use strict';

    // --- Перевірка завантаження бібліотек ---
    if (typeof THREE === 'undefined') { alert("Помилка: бібліотека Three.js не завантажилася!"); return; }
    if (typeof THREE.GLTFLoader === 'undefined') { alert("Помилка: бібліотека GLTFLoader не завантажилася!"); return; }
    if (typeof THREE.OrbitControls === 'undefined') { alert("Помилка: бібліотека OrbitControls не завантажилася!"); return; }
    if (typeof tf === 'undefined') { alert("Помилка: бібліотека TensorFlow.js не завантажилася!"); return; }
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
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333333);
        
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 8);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1, 0);
        controls.enableDamping = true;

        const grid = new THREE.GridHelper(20, 20, 0x555555, 0x555555);
        scene.add(grid);

        statusText.textContent = "Тренування ML-моделі...";
        await createAndTrainModel();
        
        statusText.textContent = "Завантаження 3D-моделей...";
        placeScene();

        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "Зупинити симуляцію" : "Симулювати навантаження";
        };
        window.addEventListener('resize', onWindowResize);

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

    // --- Логіка завантаження твоїх моделей ---
    function placeScene() {
        const loader = new THREE.GLTFLoader();
        // ВАЖЛИВО: Оновлений шлях до моделі
        loader.load(
            './assets/models/server-rack/scene.gltf',
            (gltf) => {
                console.log("Модель стійки завантажена.");
                serverRackModel = gltf.scene;
                
                serverRackModel.traverse(child => {
                    if (child.isMesh) {
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                    }
                });
                
                const box = new THREE.Box3().setFromObject(serverRackModel);
                const size = box.getSize(new THREE.Vector3());
                console.log("Розмір моделі стійки:", size);

                if (size.length() > 0.001) {
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = 3.0 / maxDim;
                    serverRackModel.scale.set(scale, scale, scale);
                }
                
                const newBox = new THREE.Box3().setFromObject(serverRackModel);
                const center = newBox.getCenter(new THREE.Vector3());
                serverRackModel.position.sub(center); 
                serverRackModel.position.y = newBox.getSize(new THREE.Vector3()).y / 2;

                scene.add(serverRackModel);
                addContainers(3);
            },
            undefined,
            (error) => {
                console.error("Помилка завантаження серверної стійки:", error);
                statusText.textContent = "Помилка завантаження моделі стійки!";
            }
        );
    }

    function addContainers(count) {
        if (!serverRackModel) return;
        const loader = new THREE.GLTFLoader();
        // ВАЖЛИВО: Оновлений шлях до моделі
        loader.load(
            './assets/models/docker-whale/scene.gltf',
            (gltf) => {
                console.log("Модель кита завантажена.");
                for (let i = 0; i < count; i++) {
                    const container = gltf.scene.clone();
                    const angle = (containers.length / 10) * Math.PI * 2;
                    const radius = 1.5;
                    
                    container.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);
                    
                    const box = new THREE.Box3().setFromObject(container);
                    const size = box.getSize(new THREE.Vector3());
                    if (size.length() > 0.001) {
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 0.5 / maxDim;
                        container.scale.set(scale, scale, scale);
                    }
                    
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