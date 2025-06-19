// Файл: src/main.js (Фінальна версія з повною візуалізацією)

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
    let serverRack, microservices = [], containers = []; // Оновили змінні
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
        camera.position.set(0, 2.5, 7); // Відсунули камеру, щоб краще бачити

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.5, 0); // Націлюємо камеру на центр стійки
        controls.enableDamping = true;

        statusText.textContent = "Тренування ML-моделі...";
        await createAndTrainModel();
        
        statusText.textContent = "Створення сцени...";
        createScene();

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
        // Анімація контейнерів для динамічності
        containers.forEach(container => {
            container.rotation.y += 0.01;
        });
        renderer.render(scene, camera);
    }

    // --- Нова логіка створення сцени ---
    // src/main.js

function createScene() {
    console.log("Створюємо дата-центр та мікросервіси.");
    
    // 1. Створюємо батьківський об'єкт для всієї нашої сцени
    // Це допоможе нам легко керувати всім разом
    serverRack = new THREE.Group();
    serverRack.position.set(0, 1.5, 0);
    scene.add(serverRack);
    
    const loader = new THREE.GLTFLoader();
    
    // Завантажуємо модель серверної стійки
    loader.load(
        'https://pilgrimxgod.github.io/exam2025/assets/models/server_rack.gltf', // Переконайся, що цей шлях правильний
        (gltf) => {
            console.log("Модель стійки завантажена.");
            const rackModel = gltf.scene;
            
            // Проходимо по моделі і налаштовуємо матеріали
            rackModel.traverse(child => {
                if (child.isMesh) {
                    child.material.metalness = 0.1;
                    child.material.roughness = 0.8;
                }
            });
            
            // Центруємо та масштабуємо
            const box = new THREE.Box3().setFromObject(rackModel);
            const center = box.getCenter(new THREE.Vector3());
            rackModel.position.sub(center);
            rackModel.scale.set(1.5, 1.5, 1.5);
            
            serverRack.add(rackModel); // Додаємо модель всередину нашої групи
            
            // 2. Створюємо мікросервіси (як і раніше, куби)
            const service1 = createMicroservice('Аутентифікація', 0x00ff00, 0, 0.5, 0.2);
            const service2 = createMicroservice('Профілі', 0xffff00, 0, 0, 0.2);
            const service3 = createMicroservice('Платежі', 0xff0000, 0, -0.5, 0.2);
            
            microservices.push(service1, service2, service3);
            microservices.forEach(ms => serverRack.add(ms));
            
            // 3. Додаємо початкові контейнери (сфери)
            addContainers(2, service1);
            addContainers(3, service2);
            addContainers(1, service3);

            statusText.textContent = "Готово до симуляції.";
        },
        undefined,
        (error) => {
            console.error("Помилка завантаження моделі стійки:", error);
            statusText.textContent = "Помилка завантаження моделі стійки!";
        }
    );
}

    function createMicroservice(name, color, x, y, z) {
        const serviceGeometry = new THREE.BoxGeometry(0.5, 0.3, 0.8);
        const serviceMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        const serviceMesh = new THREE.Mesh(serviceGeometry, serviceMaterial);
        serviceMesh.position.set(x, y - 1.5, z); // Позиція відносно центру стійки
        
        // Зберігаємо дані в об'єкті для подальшого використання
        serviceMesh.userData = { name: name, containers: [] };
        
        return serviceMesh;
    }

    function addContainers(count, microservice) {
        if (!microservice) { // Якщо сервіс не вказано, вибираємо випадковий
            microservice = microservices[Math.floor(Math.random() * microservices.length)];
        }
        console.log(`Додаємо ${count} контейнер(ів) до сервісу "${microservice.userData.name}"`);
        
        for (let i = 0; i < count; i++) {
            const containerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const containerMaterial = new THREE.MeshStandardMaterial({
                color: microservice.material.color, // Контейнер має колір свого сервісу
                emissive: microservice.material.color, // і трохи світиться
                emissiveIntensity: 0.4
            });
            const container = new THREE.Mesh(containerGeometry, containerMaterial);

            // Розміщуємо контейнер біля його мікросервісу
            const r = 0.5; // радіус орбіти
            const angle = (microservice.userData.containers.length / 5) * Math.PI * 2;
            container.position.set(
                microservice.position.x + Math.cos(angle) * r,
                microservice.position.y + Math.sin(angle) * r,
                microservice.position.z
            );
            
            microservice.userData.containers.push(container);
            containers.push(container); // Загальний список для анімації
            serverRack.add(container); // Додаємо на сцену (всередину стійки)
        }
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
            if (prediction > LOAD_THRESHOLD) {
                // Вибираємо випадковий сервіс для масштабування
                const targetService = microservices[Math.floor(Math.random() * microservices.length)];
                statusText.innerHTML = `Прогноз: ${prediction.toFixed(2)}<br><b>Масштабування сервісу ${targetService.userData.name}!</b>`;
                addContainers(1, targetService); // Додаємо новий контейнер до цільового сервісу
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