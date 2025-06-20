// Файл: src/main.js (Фінальна версія з симуляцією збою)

window.onload = () => {
    'use strict';

    if (typeof THREE === 'undefined') { alert("Помилка: Three.js не завантажився!"); return; }
    if (typeof THREE.CSS2DRenderer === 'undefined') { alert("Помилка: CSS2DRenderer не завантажилася!"); return; }
    if (typeof tf === 'undefined') { alert("Помилка: TensorFlow.js не завантажилася!"); return; }
    console.log("✅ Всі бібліотеки успішно завантажені.");

    let scene, camera, renderer, controls, labelRenderer, clock;
    let datacenter, microservices = [], containers = [], serverRacks = [];
    const dataPackets = [];
    let mlModel = null, simulationActive = false, simulationTime = 0;
    const loadHistory = [];
    const MIN_CONTAINERS = 4, MAX_CONTAINERS = 50;
    let isAutoMode = true;
    let isFailoverActive = false;
    let isMoving = false; 

    const objectInfo = {
        'Серверна стійка (Основна)': 'Це основний "гарячий" кластер, що обробляє 100% запитів. Включає потужні обчислювальні вузли та швидку пам\'ять. Дублювання ключових сервісів тут забезпечує відмовостійкість (High Availability).',
        'Серверна стійка (Резервна)': 'Це резервний "холодний" кластер. Він неактивний і не обробляє запити, але готовий перебрати на себе навантаження у разі повної відмови основного кластера (концепція Disaster Recovery).',
        'Аутентифікація': 'Відповідає за вхід користувачів, реєстрацію та перевірку прав доступу.',
        'Профілі': 'Зберігає та керує даними користувачів: імена, аватари, налаштування.',
        'Платежі': 'Обробляє транзакції, інтегрується з платіжними шлюзами.',
        'API Gateway': 'Єдина точка входу для всіх зовнішніх запитів. Маршрутизує запити.',
        'Контейнер': 'Ізольоване середовище для запуску коду мікросервісу (Docker).'
    };

    const simButton = document.getElementById('simulate-load-btn');
    const failoverBtn = document.getElementById('failover-btn');
    const statusText = document.getElementById('status-text');
    const predictionText = document.getElementById('prediction-text');
    const serviceCountEl = document.getElementById('service-count');
    const containerCountEl = document.getElementById('container-count');
    const modeSwitch = document.getElementById('mode-switch');
    const sliderWrapper = document.getElementById('slider-wrapper');
    const loadSlider = document.getElementById('load-slider');
    const infoBox = document.getElementById('info-box');
    const infoTitle = document.getElementById('info-title');
    const infoDescription = document.getElementById('info-description');
    const infoCloseBtn = document.getElementById('info-close-btn');
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let lastAdjustmentTime = 0;
    const ADJUSTMENT_INTERVAL = 1000;
    
    async function main() {
        initializeScene();
        await createAndTrainModel();
        createDatacenter();
        setupEventHandlers();
        animate();
        statusText.textContent = "Готово";
    }

    function initializeScene() {
        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 5, 12);
        scene.add(new THREE.AmbientLight(0x404040, 1.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(10, 10, 5);
        scene.add(dirLight);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        labelRenderer = new THREE.CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none';
        document.body.appendChild(labelRenderer.domElement);
        initializeOrbitControls();
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.5, 0);
        controls.enableDamping = true;
    }

    function createDatacenter() {
        datacenter = new THREE.Group();
        scene.add(datacenter);
        const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        datacenter.add(grid);
        createServerRacks();
        const mainRack = serverRacks.find(r => r.userData.isPrimary);
        // Створюємо мікросервіси відносно початкової позиції основного сервера
        createAllMicroservices(mainRack.position);
    }

    function createServerRacks() {
        const rackGeometry = new THREE.BoxGeometry(2, 4.5, 1.5);
        const mainRackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const mainRack = new THREE.Mesh(rackGeometry, mainRackMaterial);
        mainRack.position.set(-5, 2.25, 0);
        mainRack.userData = { name: 'Серверна стійка (Основна)', isPrimary: true };
        datacenter.add(mainRack);
        serverRacks.push(mainRack);
        const backupRackMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1d2b, roughness: 0.9 });
        const backupRack = new THREE.Mesh(rackGeometry, backupRackMaterial);
        backupRack.position.set(5, 2.25, 0);
        backupRack.userData = { name: 'Серверна стійка (Резервна)', isPrimary: false };
        datacenter.add(backupRack);
        serverRacks.push(backupRack);
    }
    
    function createAllMicroservices(targetCenter) {
        const r = 2.5;
        const service1 = createMicroservice('Аутентифікація', 0x00ff00, targetCenter.x, targetCenter.y, targetCenter.z + r);
        const service2 = createMicroservice('Профілі', 0xffff00, targetCenter.x + r, targetCenter.y, targetCenter.z);
        const service3 = createMicroservice('Платежі', 0xff0000, targetCenter.x, targetCenter.y, targetCenter.z - r);
        const service4 = createMicroservice('API Gateway', 0x00ffff, targetCenter.x - r, targetCenter.y, targetCenter.z);
        
        microservices = [service1, service2, service3, service4];
        microservices.forEach(ms => datacenter.add(ms));
        serviceCountEl.textContent = microservices.length;
        
        // Додаємо початкові контейнери (вони автоматично прив'яжуться до сервісів)
        addContainers(1, service1, true);
        addContainers(1, service2, true);
        addContainers(1, service3, true);
        addContainers(1, service4, true);
    }
    
    function clearAllMicroservices() {
        // Проходимо по кожному мікросервісу і видаляємо його разом з дочірніми об'єктами (включаючи мітки)
        microservices.forEach(ms => {
            ms.traverse(function (object) {
                if (object.isCSS2DObject) {
                    ms.remove(object); // Видаляємо мітку з батька
                }
            });
            datacenter.remove(ms);
        });
        
        containers.forEach(c => datacenter.remove(c));
        
        microservices = [];
        containers = [];
        containerCountEl.textContent = 0;
        serviceCountEl.textContent = 0;
    }

    function createMicroservice(name, color, x, y, z) {
        const serviceGeometry = new THREE.BoxGeometry(1.2, 0.6, 1.2);
        const serviceMaterial = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.8, emissive: color, emissiveIntensity: 0.2 });
        const serviceMesh = new THREE.Mesh(serviceGeometry, serviceMaterial);
        serviceMesh.position.set(x, y, z);
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = name;
        const label = new THREE.CSS2DObject(labelDiv);
        label.position.set(0, 0.6, 0);
        serviceMesh.add(label);
        serviceMesh.userData = { name: name, containers: [] };
        return serviceMesh;
    }

    function addContainers(count, microservice, isInstant = false) {
        if (!microservice) return;
        for (let i = 0; i < count; i++) {
            const containerGeometry = new THREE.SphereGeometry(0.15, 16, 16);
            const containerMaterial = new THREE.MeshStandardMaterial({ color: microservice.material.color, emissive: microservice.material.color, emissiveIntensity: 0.6 });
            const container = new THREE.Mesh(containerGeometry, containerMaterial);
            
            // ЗМІНЕНО: Контейнери тепер ближче до сервісу
            const containerCount = microservice.userData.containers.length;
            const radius = 0.8 + Math.floor(containerCount / 8) * 0.3; // Радіус орбіти
            const angle = (containerCount % 8) * (Math.PI / 4) + Math.random() * 0.2;
            
            container.position.set(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );
            container.userData = { timeOffset: Math.random() * 100 };
            
            if (isInstant) { container.scale.set(1, 1, 1); } 
            else { container.scale.set(0.01, 0.01, 0.01); animateScale(container, new THREE.Vector3(1, 1, 1), 0.5); }
            
            microservice.userData.containers.push(container);
            // Додаємо контейнер як дочірній об'єкт мікросервісу
            microservice.add(container);
            // Додаємо в глобальний масив для анімації
            containers.push(container);
        }
        containerCountEl.textContent = containers.length;
    }
    
    function removeContainer(microservice) {
        if (!microservice || microservice.userData.containers.length <= 1) return; 
        const containerToRemove = microservice.userData.containers.pop();
        const indexInGlobalArray = containers.indexOf(containerToRemove);
        if (indexInGlobalArray > -1) { containers.splice(indexInGlobalArray, 1); }
        animateScale(containerToRemove, new THREE.Vector3(0.01, 0.01, 0.01), 0.5, () => { datacenter.remove(containerToRemove); });
        containerCountEl.textContent = containers.length;
    }
    
    function animateScale(object, targetScale, duration, onComplete) {
        const startScale = object.scale.clone();
        const start = performance.now();
        function scaleStep() {
            const elapsed = (performance.now() - start) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            object.scale.lerpVectors(startScale, targetScale, progress);
            if (progress < 1) { requestAnimationFrame(scaleStep); } 
            else { if (onComplete) onComplete(); }
        }
        scaleStep();
    }

    function moveMicroservices(targetRack) {
        isMoving = true;
        const targetCenter = targetRack.position;
        const r = 2.5;
        const targetPositions = [
            new THREE.Vector3(targetCenter.x, targetCenter.y, targetCenter.z + r),
            new THREE.Vector3(targetCenter.x + r, targetCenter.y, targetCenter.z),
            new THREE.Vector3(targetCenter.x, targetCenter.y, targetCenter.z - r),
            new THREE.Vector3(targetCenter.x - r, targetCenter.y, targetCenter.z)
        ];

        microservices.forEach((ms, index) => {
            // Використовуємо GSAP або просту анімацію для плавного переміщення
            // Для простоти, зробимо поки що миттєве переміщення
            // ms.position.copy(targetPositions[index]);
            
            // Плавна анімація (потребує requestAnimationFrame)
            animateMovement(ms, targetPositions[index], 1.0, () => {
                if (index === microservices.length - 1) {
                    isMoving = false; // Анімація завершена
                }
            });
        });
    }

    // НОВА ФУНКЦІЯ ДЛЯ АНІМАЦІЇ РУХУ
    function animateMovement(object, targetPosition, duration, onComplete) {
        const startPosition = object.position.clone();
        const start = performance.now();
        function moveStep() {
            const elapsed = (performance.now() - start) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            
            // Рух по дузі для краси
            const currentPos = new THREE.Vector3().lerpVectors(startPosition, targetPosition, progress);
            currentPos.y += Math.sin(progress * Math.PI) * 2; // Висота дуги
            
            object.position.copy(currentPos);

            if (progress < 1) {
                requestAnimationFrame(moveStep);
            } else {
                if (onComplete) onComplete();
            }
        }
        moveStep();
    }

    // ЗМІНЕНО: Рух пакетів по дузі
    function createDataPacket() {
        if (microservices.length < 2) return;
        let startService, endService;
        do {
            startService = microservices[Math.floor(Math.random() * microservices.length)];
            endService = microservices[Math.floor(Math.random() * microservices.length)];
        } while (startService === endService);

        const packetGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const packet = new THREE.Mesh(packetGeometry, packetMaterial);

        packet.userData = {
            start: startService.position,
            end: endService.position,
            progress: 0
        };
        
        dataPackets.push(packet);
        scene.add(packet);
    }
    
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }

    function setupEventHandlers() {
        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "⏸️ Зупинити симуляцію" : "▶️ Симулювати навантаження";
        };
        failoverBtn.onclick = () => {
            // Перевіряємо, чи не йде вже анімація переміщення
            if (isMoving) return; 

            isFailoverActive = !isFailoverActive;
            if (isFailoverActive) {
                simulateFailure();
            } else {
                repairSystem();
            }
        };
        modeSwitch.onchange = (event) => {
            isAutoMode = event.target.checked;
            sliderWrapper.style.display = isAutoMode ? 'none' : 'flex';
        };
        loadSlider.oninput = (event) => {
            if (!isAutoMode) {
                const manualLoad = parseFloat(event.target.value) / 100;
                statusText.textContent = `Навантаження: ${manualLoad.toFixed(2)}`;
                loadHistory.push(manualLoad);
                if (loadHistory.length > 10) loadHistory.shift();
            }
        };
        renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false);
        infoCloseBtn.onclick = () => { infoBox.style.display = 'none'; };
        window.addEventListener('resize', onWindowResize);
    }
    
    function onDocumentMouseDown(event) {
        event.preventDefault();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects([...microservices, ...containers, ...serverRacks]);
        if (intersects.length > 0) {
            let clickedObject = intersects[0].object;
            while (clickedObject.parent && !clickedObject.userData.name) {
                clickedObject = clickedObject.parent;
            }
            if (containers.includes(clickedObject)) {
                showInfo('Контейнер', objectInfo['Контейнер'] + ` Належить до сервісу "${clickedObject.userData.service.userData.name}".`);
            } else if (microservices.includes(clickedObject) || serverRacks.includes(clickedObject)) {
                showInfo(clickedObject.userData.name, objectInfo[clickedObject.userData.name]);
            }
        }
    }
    
    function showInfo(title, description) {
        infoTitle.textContent = title;
        infoDescription.textContent = description || "Інформація для цього об'єкта відсутня.";
        infoBox.style.display = 'block';
    }
    
    function simulateFailure() {
        failoverBtn.textContent = "✅ Відновити систему";
        statusText.textContent = "Збій! Переключення...";
        
        const mainRack = serverRacks.find(r => r.userData.isPrimary);
        const backupRack = serverRacks.find(r => !r.userData.isPrimary);
        
        mainRack.material.color.setHex(0x550000);
        mainRack.material.emissive.setHex(0x330000);
        
        // Переміщуємо сервіси на резервний сервер
        moveMicroservices(backupRack);
    }

    function repairSystem() {
        failoverBtn.textContent = "🚨 Симулювати збій";
        statusText.textContent = "Відновлення...";
        
        const mainRack = serverRacks.find(r => r.userData.isPrimary);
        
        mainRack.material.color.setHex(0x333333);
        mainRack.material.emissive.setHex(0x000000);
        
        // Переміщуємо сервіси назад на основний сервер
        moveMicroservices(mainRack);
    }

    async function createAndTrainModel() {
        statusText.textContent = "🤖 Тренування ML...";
        let model = tf.sequential();
        model.add(tf.layers.lstm({ units: 16, inputShape: [10, 1] }));
        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
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
        await model.fit(xs_reshaped, ys, { epochs: 40, verbose: 0 });
        console.log("🎓 ML-модель успішно натренована!");
        xs.dispose(); ys.dispose(); xs_reshaped.dispose();
        mlModel = model;
    }
    
    async function handleSimulation() {
        let currentLoad;
        if (isAutoMode) {
            simulationTime += 0.003;
            currentLoad = (Math.sin(simulationTime) + Math.sin(simulationTime * 2.7)) / 2 * 0.5 + 0.5;
            statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
        } else {
            currentLoad = parseFloat(loadSlider.value) / 100;
        }
        loadHistory.push(currentLoad);
        if (loadHistory.length > 10) { loadHistory.shift(); }
        if (loadHistory.length === 10 && mlModel) {
            const prediction = await predictLoad(loadHistory);
            if (prediction !== null) {
                predictionText.textContent = prediction.toFixed(2);
                const now = performance.now();
                if (now - lastAdjustmentTime > ADJUSTMENT_INTERVAL) {
                    adjustContainers(prediction);
                    lastAdjustmentTime = now;
                }
            }
        }
    }
    
    function adjustContainers(predictedLoad) {
        const targetCount = Math.round(MIN_CONTAINERS + (MAX_CONTAINERS - MIN_CONTAINERS) * predictedLoad);
        const currentCount = containers.length;
        if (currentCount < targetCount) {
            const targetService = microservices[Math.floor(Math.random() * microservices.length)];
            addContainers(1, targetService);
        } else if (currentCount > targetCount && currentCount > MIN_CONTAINERS) {
            const targetServiceWithMostContainers = microservices.reduce((prev, curr) => prev.userData.containers.length > curr.userData.containers.length ? prev : curr);
            if (targetServiceWithMostContainers.userData.containers.length > 1) {
                removeContainer(targetServiceWithMostContainers);
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

    function initializeOrbitControls() {
        THREE.OrbitControls = function(object, domElement) { this.object = object; this.domElement = domElement; this.enabled = true; this.target = new THREE.Vector3(); this.enableDamping = false; this.dampingFactor = 0.05; this.enableZoom = true; this.enableRotate = true; this.enablePan = true; var scope = this; var rotateSpeed = 1.0; var zoomSpeed = 1.0; var spherical = new THREE.Spherical(); var sphericalDelta = new THREE.Spherical(); var scale = 1; var panOffset = new THREE.Vector3(); var rotateStart = new THREE.Vector2(); var rotateEnd = new THREE.Vector2(); var rotateDelta = new THREE.Vector2(); var STATE = { NONE: -1, ROTATE: 0 }; var state = STATE.NONE; this.update = function() { var offset = new THREE.Vector3(); var quat = new THREE.Quaternion().setFromUnitVectors(object.up, new THREE.Vector3(0, 1, 0)); var quatInverse = quat.clone().invert(); var position = scope.object.position; offset.copy(position).sub(scope.target); offset.applyQuaternion(quat); spherical.setFromVector3(offset); if (scope.enableDamping) { spherical.theta += sphericalDelta.theta * scope.dampingFactor; spherical.phi += sphericalDelta.phi * scope.dampingFactor; } else { spherical.theta += sphericalDelta.theta; spherical.phi += sphericalDelta.phi; } spherical.makeSafe(); spherical.radius *= scale; if (scope.enableDamping) { scope.target.addScaledVector(panOffset, scope.dampingFactor); } else { scope.target.add(panOffset); } offset.setFromSpherical(spherical); offset.applyQuaternion(quatInverse); position.copy(scope.target).add(offset); scope.object.lookAt(scope.target); if (scope.enableDamping) { sphericalDelta.theta *= (1 - scope.dampingFactor); sphericalDelta.phi *= (1 - scope.dampingFactor); panOffset.multiplyScalar(1 - scope.dampingFactor); } else { sphericalDelta.set(0, 0, 0); panOffset.set(0, 0, 0); } scale = 1; return true; }; function onMouseDown(event) { if (!scope.enabled) return; event.preventDefault(); if (event.button === 0) { state = STATE.ROTATE; rotateStart.set(event.clientX, event.clientY); } document.addEventListener('mousemove', onMouseMove, false); document.addEventListener('mouseup', onMouseUp, false); } function onMouseMove(event) { if (!scope.enabled) return; event.preventDefault(); if (state === STATE.ROTATE) { rotateEnd.set(event.clientX, event.clientY); rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(rotateSpeed); sphericalDelta.theta -= 2 * Math.PI * rotateDelta.x / scope.domElement.clientWidth; sphericalDelta.phi -= 2 * Math.PI * rotateDelta.y / scope.domElement.clientHeight; rotateStart.copy(rotateEnd); } } function onMouseUp() { if (!scope.enabled) return; document.removeEventListener('mousemove', onMouseMove, false); document.removeEventListener('mouseup', onMouseUp, false); state = STATE.NONE; } function onMouseWheel(event) { if (!scope.enabled || !scope.enableZoom) return; event.preventDefault(); if (event.deltaY < 0) { scale /= Math.pow(0.95, zoomSpeed); } else if (event.deltaY > 0) { scale *= Math.pow(0.95, zoomSpeed); } } if (domElement) { domElement.addEventListener('mousedown', onMouseDown, false); domElement.addEventListener('wheel', onMouseWheel, false); domElement.addEventListener('contextmenu', function(event) { event.preventDefault(); }, false); } };
    }
    
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        const delta = Math.min(clock.getDelta(), 0.1); 
        const time = performance.now() * 0.001;
        containers.forEach(container => {
            const scale = 1 + Math.sin(time * 5 + container.userData.timeOffset) * 0.2;
            container.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
        });
        if (simulationActive && Math.random() < 0.1 && dataPackets.length < 20) {
            createDataPacket();
        }
        for (let i = dataPackets.length - 1; i >= 0; i--) {
            const packet = dataPackets[i];
            packet.userData.progress += delta * 1.2; // Трохи повільніше
            
            const start = packet.userData.start;
            const end = packet.userData.end;
            
            // Інтерполяція по прямій
            const currentPos = new THREE.Vector3().lerpVectors(start, end, packet.userData.progress);
            // Додаємо висоту по параболі
            currentPos.y += Math.sin(packet.userData.progress * Math.PI) * 1.5;
            
            packet.position.copy(currentPos);
            
            if (packet.userData.progress >= 1) {
                scene.remove(packet);
                dataPackets.splice(i, 1);
            }
        }
        if (simulationActive) {
            handleSimulation();
        }
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }
    
    main();
};