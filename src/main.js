// Файл: src/main.js (Версія "Все в одному")

(function() { // Ізолюємо весь код
    'use strict';

    // ===============================================================
    // КОД З ФАЙЛУ scaling-model.js ТЕПЕР ЗНАХОДИТЬСЯ ТУТ
    // ===============================================================
    let mlModel; // Змінна для моделі тепер тут
    
    async function createAndTrainModel() {
        console.log("Починаємо створення та тренування ML-моделі...");
        let model = tf.sequential();
        model.add(tf.layers.lstm({ units: 16, inputShape: [10, 1] }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

        // Генерація даних для тренування
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
        xs.dispose(); ys.dispose(); xs_reshaped.dispose();
        
        mlModel = model; // Зберігаємо натреновану модель
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
    // ОСНОВНИЙ КОД AR-ДОДАТКУ
    // ===============================================================
    let scene, camera, renderer;
    let serverRackModel = null, containers = [];
    let simulationActive = false, simulationTime = 0;
    const LOAD_THRESHOLD = 0.75;
    let loadHistory = [];

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
        // Тепер просто викликаємо функцію, яка знаходиться в цьому ж файлі
        await createAndTrainModel(); 
        placeSceneInFrontOfCamera();

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