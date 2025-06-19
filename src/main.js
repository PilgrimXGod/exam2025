// Файл: src/main.js (Повна фінальна версія з анімацією та робочою симуляцією)

window.onload = () => {
    'use strict';

    // --- Перевірка завантаження бібліотек ---
    if (typeof THREE === 'undefined') { alert("Помилка: Three.js не завантажився!"); return; }
    if (typeof THREE.CSS2DRenderer === 'undefined') { alert("Помилка: CSS2DRenderer не завантажився!"); return; }
    if (typeof tf === 'undefined') { alert("Помилка: TensorFlow.js не завантажилася!"); return; }
    console.log("✅ Всі бібліотеки успішно завантажені.");

    // --- Глобальні змінні ---
    let scene, camera, renderer, controls, labelRenderer;
    let datacenter, microservices = [], containers = [];
    const dataPackets = []; // Для анімації запитів
    let mlModel = null, simulationActive = false, simulationTime = 0;
    const loadHistory = [], LOAD_THRESHOLD = 0.75;

    // --- Елементи UI ---
    const simButton = document.getElementById('simulate-load-btn');
    const statusText = document.getElementById('status-text');
    const predictionText = document.getElementById('prediction-text');
    const serviceCountEl = document.getElementById('service-count');
    const containerCountEl = document.getElementById('container-count');

    // --- Основна функція ---
    async function main() {
        try {
            initializeScene();
            await createAndTrainModel();
            createDatacenter();
            setupEventHandlers();
            animate();
            statusText.textContent = "Готово";
        } catch (error) {
            console.error("❌ Помилка ініціалізації:", error);
            statusText.textContent = "Помилка!";
        }
    }

    // --- Ініціалізація сцени ---
    function initializeScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(8, 6, 8);

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
        controls.target.set(0, 2, 0);
        controls.enableDamping = true;
    }

    // --- Створення сцени ---
    function createDatacenter() {
        datacenter = new THREE.Group();
        scene.add(datacenter);

        const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        datacenter.add(grid);

        createServerRacks();

        const service1 = createMicroservice('Аутентифікація', 0x00ff00, -3, 2, 0);
        const service2 = createMicroservice('Профілі', 0xffff00, 0, 2, -3);
        const service3 = createMicroservice('Платежі', 0xff0000, 3, 2, 0);
        const service4 = createMicroservice('API Gateway', 0x00ffff, 0, 2, 3);
        
        microservices.push(service1, service2, service3, service4);
        microservices.forEach(ms => datacenter.add(ms));
        serviceCountEl.textContent = microservices.length;
        
        addContainers(2, service1);
        addContainers(3, service2);
        addContainers(1, service3);
        addContainers(2, service4);
    }

    function createServerRacks() {
        const rackGeometry = new THREE.BoxGeometry(1.5, 4, 1);
        const rackMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
        const positions = [ [-4, 0, -4], [4, 0, -4], [-4, 0, 4], [4, 0, 4] ];
        positions.forEach(pos => {
            const rack = new THREE.Mesh(rackGeometry, rackMaterial.clone());
            rack.position.set(pos[0], 2, pos[1]);
            datacenter.add(rack);
        });
    }

    function createMicroservice(name, color, x, y, z) {
        const serviceGeometry = new THREE.BoxGeometry(1, 0.5, 1);
        const serviceMaterial = new THREE.MeshStandardMaterial({
            color: color, transparent: true, opacity: 0.8, emissive: color, emissiveIntensity: 0.1
        });
        const serviceMesh = new THREE.Mesh(serviceGeometry, serviceMaterial);
        serviceMesh.position.set(x, y, z);
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = name;
        const label = new THREE.CSS2DObject(labelDiv);
        label.position.set(0, 0.5, 0);
        serviceMesh.add(label);
        
        serviceMesh.userData = { name: name, containers: [] };
        return serviceMesh;
    }

    function addContainers(count, microservice) {
        if (!microservice) return;
        
        for (let i = 0; i < count; i++) {
            const containerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const containerMaterial = new THREE.MeshStandardMaterial({
                color: microservice.material.color, emissive: microservice.material.color, emissiveIntensity: 0.5
            });
            const container = new THREE.Mesh(containerGeometry, containerMaterial);

            const containerCount = microservice.userData.containers.length;
            const radius = 0.8;
            const angle = (containerCount * 1.2) + Math.random();
            
            container.position.set(
                microservice.position.x + Math.cos(angle) * radius,
                microservice.position.y,
                microservice.position.z + Math.sin(angle) * radius
            );
            
            container.userData = { service: microservice, orbitAngle: angle, orbitRadius: radius, timeOffset: Math.random() * 100 };
            
            microservice.userData.containers.push(container);
            containers.push(container);
            datacenter.add(container);
        }
        containerCountEl.textContent = containers.length;
    }
    
    // --- Логіка анімації, симуляції та ML ---
    function createDataPacket() {
        if (microservices.length < 2) return;
        
        let startService, endService;
        do {
            startService = microservices[Math.floor(Math.random() * microservices.length)];
            endService = microservices[Math.floor(Math.random() * microservices.length)];
        } while (startService === endService);

        const packetGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
        const packet = new THREE.Mesh(packetGeometry, packetMaterial);

        packet.userData = {
            start: startService.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
            end: endService.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
            progress: 0
        };
        
        dataPackets.push(packet);
        scene.add(packet);
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
        if (!simulationActive) return;
        
        simulationTime += 0.05;
        const currentLoad = Math.sin(simulationTime) * 0.5 + 0.5;
        statusText.textContent = `Навантаження: ${currentLoad.toFixed(2)}`;
        loadHistory.push(currentLoad);
        if (loadHistory.length > 10) { loadHistory.shift(); }
        
        if (loadHistory.length === 10 && mlModel) {
            const prediction = await predictLoad(loadHistory);
            predictionText.textContent = prediction.toFixed(2);
            if (prediction > LOAD_THRESHOLD && containers.length < 50) {
                const targetService = microservices[Math.floor(Math.random() * microservices.length)];
                statusText.innerHTML = `🚨 Масштабування: ${targetService.userData.name}`;
                addContainers(1, targetService);
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

    function setupEventHandlers() {
        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "⏸️ Зупинити симуляцію" : "▶️ Симулювати навантаження";
        };
        window.addEventListener('resize', onWindowResize);
    }

    function animate() {
        requestAnimationFrame(animate);
        const delta = 0.02;
        simulationTime += delta;
        controls.update();

        // Анімація контейнерів (пульсація)
        containers.forEach(container => {
            const scale = 1 + Math.sin(simulationTime * 5 + container.userData.timeOffset) * 0.2;
            container.scale.set(scale, scale, scale);
        });
        
        // Створення та анімація пакетів даних
        if (simulationActive && Math.random() < 0.1) {
            createDataPacket();
        }

        for (let i = dataPackets.length - 1; i >= 0; i--) {
            const packet = dataPackets[i];
            packet.userData.progress += 0.02;
            packet.position.lerpVectors(packet.userData.start, packet.userData.end, packet.userData.progress);
            packet.material.opacity = 1.0 - packet.userData.progress;
            
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
    
    // Вбудовані OrbitControls
    function initializeOrbitControls() {
        THREE.OrbitControls = function(object, domElement) {
            this.object = object;
            this.domElement = domElement;
            this.enabled = true;
            this.target = new THREE.Vector3();
            this.enableDamping = false;
            this.dampingFactor = 0.05;
            this.enableZoom = true;
            this.enableRotate = true;
            this.enablePan = true;
            var scope = this;
            var rotateSpeed = 1.0;
            var zoomSpeed = 1.0;
            var spherical = new THREE.Spherical();
            var sphericalDelta = new THREE.Spherical();
            var scale = 1;
            var panOffset = new THREE.Vector3();
            var rotateStart = new THREE.Vector2();
            var rotateEnd = new THREE.Vector2();
            var rotateDelta = new THREE.Vector2();
            var STATE = { NONE: -1, ROTATE: 0 };
            var state = STATE.NONE;
            this.update = function() {
                var offset = new THREE.Vector3();
                var quat = new THREE.Quaternion().setFromUnitVectors(object.up, new THREE.Vector3(0, 1, 0));
                var quatInverse = quat.clone().invert();
                var position = scope.object.position;
                offset.copy(position).sub(scope.target);
                offset.applyQuaternion(quat);
                spherical.setFromVector3(offset);
                if (scope.enableDamping) {
                    spherical.theta += sphericalDelta.theta * scope.dampingFactor;
                    spherical.phi += sphericalDelta.phi * scope.dampingFactor;
                } else {
                    spherical.theta += sphericalDelta.theta;
                    spherical.phi += sphericalDelta.phi;
                }
                spherical.makeSafe();
                spherical.radius *= scale;
                if (scope.enableDamping) {
                    scope.target.addScaledVector(panOffset, scope.dampingFactor);
                } else {
                    scope.target.add(panOffset);
                }
                offset.setFromSpherical(spherical);
                offset.applyQuaternion(quatInverse);
                position.copy(scope.target).add(offset);
                scope.object.lookAt(scope.target);
                if (scope.enableDamping) {
                    sphericalDelta.theta *= (1 - scope.dampingFactor);
                    sphericalDelta.phi *= (1 - scope.dampingFactor);
                    panOffset.multiplyScalar(1 - scope.dampingFactor);
                } else {
                    sphericalDelta.set(0, 0, 0);
                    panOffset.set(0, 0, 0);
                }
                scale = 1;
                return true;
            };
            function onMouseDown(event) {
                if (!scope.enabled) return;
                event.preventDefault();
                if (event.button === 0) {
                    state = STATE.ROTATE;
                    rotateStart.set(event.clientX, event.clientY);
                }
                document.addEventListener('mousemove', onMouseMove, false);
                document.addEventListener('mouseup', onMouseUp, false);
            }
            function onMouseMove(event) {
                if (!scope.enabled) return;
                event.preventDefault();
                if (state === STATE.ROTATE) {
                    rotateEnd.set(event.clientX, event.clientY);
                    rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(rotateSpeed);
                    sphericalDelta.theta -= 2 * Math.PI * rotateDelta.x / scope.domElement.clientWidth;
                    sphericalDelta.phi -= 2 * Math.PI * rotateDelta.y / scope.domElement.clientHeight;
                    rotateStart.copy(rotateEnd);
                }
            }
            function onMouseUp() {
                if (!scope.enabled) return;
                document.removeEventListener('mousemove', onMouseMove, false);
                document.removeEventListener('mouseup', onMouseUp, false);
                state = STATE.NONE;
            }
            function onMouseWheel(event) {
                if (!scope.enabled || !scope.enableZoom) return;
                event.preventDefault();
                if (event.deltaY < 0) {
                    scale /= Math.pow(0.95, zoomSpeed);
                } else if (event.deltaY > 0) {
                    scale *= Math.pow(0.95, zoomSpeed);
                }
            }
            if (domElement) {
                domElement.addEventListener('mousedown', onMouseDown, false);
                domElement.addEventListener('wheel', onMouseWheel, false);
                domElement.addEventListener('contextmenu', function(event) { event.preventDefault(); }, false);
            }
        };
    }

    // Запуск програми
    main();
};