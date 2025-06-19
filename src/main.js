// Файл: src/main.js (Версія з фігурами-заглушками замість моделей)

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
        scene.fog = new THREE.Fog(0x333333, 10, 40);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 6);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
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
        
        statusText.textContent = "Створення сцени...";
        placeScene(); // Ця функція тепер миттєва

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

    // --- Логіка створення сцени з заглушками ---
    function placeScene() {
        console.log("Створюємо серверну стійку-заглушку.");
        
        // Створюємо куб, який імітує серверну стійку
        const rackGeometry = new THREE.BoxGeometry(1, 2, 0.8);
        const rackMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        serverRackModel = new THREE.Mesh(rackGeometry, rackMaterial);
        
        serverRackModel.position.set(0, 1, 0); // Піднімаємо, щоб стояв на сітці
        scene.add(serverRackModel);
        
        addContainers(3); // Додаємо початкові контейнери
    }

    function addContainers(count) {
        if (!serverRackModel) return;
        console.log(`Додаємо ${count} контейнерів-заглушок.`);
        
        for (let i = 0; i < count; i++) {
            // Створюємо сферу, яка імітує контейнер
            const containerGeometry = new THREE.SphereGeometry(0.2, 16, 16);
            const containerMaterial = new THREE.MeshStandardMaterial({
                color: 0x0db7ed,
                metalness: 0.2,
                roughness: 0.5
            });
            const container = new THREE.Mesh(containerGeometry, containerMaterial);

            const angle = (containers.length / 10) * Math.PI * 2;
            const radius = 1.5;
            
            container.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);

            scene.add(container);
            containers.push(container);
        }
        statusText.textContent = "Готово до симуляції.";
    }

    // --- Логіка ML та симуляції ---
    async function createAndTrainModel() {
        // ... код ML без змін ...
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
                addContainers(1); // Додаємо нові сфери-контейнери
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