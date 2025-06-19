// Файл: src/main.js (Виправлена версія)

window.onload = () => {
    'use strict';

    // --- Перевірка завантаження бібліотек ---
    if (typeof THREE === 'undefined') { 
        alert("Помилка: бібліотека Three.js не завантажилася!"); 
        return; 
    }
    if (typeof tf === 'undefined') { 
        alert("Помилка: бібліотека TensorFlow.js не завантажилася!"); 
        return; 
    }
    console.log("✅ Основні бібліотеки успішно завантажені.");

    // --- Глобальні змінні ---
    let scene, camera, renderer, controls;
    let datacenter, microservices = [], containers = [];
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
        try {
            await initializeScene();
            await createAndTrainModel();
            createDatacenter();
            setupEventHandlers();
            animate();
            statusText.textContent = "✅ Система готова до роботи!";
        } catch (error) {
            console.error("❌ Помилка ініціалізації:", error);
            statusText.textContent = "❌ Помилка ініціалізації!";
        }
    }

    // --- Ініціалізація сцени ---
    async function initializeScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(8, 6, 8);

        // Освітлення
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(10, 10, 5);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // Додаємо кольорове освітлення для атмосфери
        const greenLight = new THREE.PointLight(0x00ff00, 0.5, 15);
        greenLight.position.set(-5, 5, -5);
        scene.add(greenLight);

        const blueLight = new THREE.PointLight(0x0066ff, 0.5, 15);
        blueLight.position.set(5, 5, 5);
        scene.add(blueLight);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);

        // Ініціалізуємо OrbitControls вручну (без імпорту)
        initializeOrbitControls();
        
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 2, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        console.log("🎬 Сцена ініціалізована");
    }

    // --- Ініціалізація OrbitControls (спрощена версія) ---
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
            this.autoRotate = false;

            var scope = this;
            var rotateSpeed = 1.0;
            var zoomSpeed = 1.0;
            var panSpeed = 1.0;

            var spherical = new THREE.Spherical();
            var sphericalDelta = new THREE.Spherical();
            var scale = 1;
            var panOffset = new THREE.Vector3();

            var rotateStart = new THREE.Vector2();
            var rotateEnd = new THREE.Vector2();
            var rotateDelta = new THREE.Vector2();

            var STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2 };
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
                spherical.radius = Math.max(0.1, Math.min(100, spherical.radius));

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

            // Основні обробники подій
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

            // Додаємо обробники подій
            if (domElement) {
                domElement.addEventListener('mousedown', onMouseDown, false);
                domElement.addEventListener('wheel', onMouseWheel, false);
                domElement.addEventListener('contextmenu', function(event) { event.preventDefault(); }, false);
            }
        };
    }

    // --- Створення дата-центру (без завантаження моделі) ---
    function createDatacenter() {
        console.log("🏗️ Створюємо дата-центр та мікросервіси.");
        
        datacenter = new THREE.Group();
        datacenter.position.set(0, 1.5, 0);
        scene.add(datacenter);

        // Створюємо підлогу дата-центру
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.8
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.5;
        floor.receiveShadow = true;
        datacenter.add(floor);

        // Створюємо серверні стійки замість завантаження моделі
        createServerRacks();

        // Створюємо мікросервіси
        const service1 = createMicroservice('Аутентифікація', 0x00ff00, -2, 0.5, 0);
        const service2 = createMicroservice('Профілі', 0xffff00, 0, 0.5, -2);
        const service3 = createMicroservice('Платежі', 0xff0000, 2, 0.5, 0);
        const service4 = createMicroservice('API Gateway', 0x00ffff, 0, 0.5, 2);
        
        microservices.push(service1, service2, service3, service4);
        microservices.forEach(ms => datacenter.add(ms));
        
        // Додаємо початкові контейнери
        addContainers(2, service1);
        addContainers(3, service2);
        addContainers(1, service3);
        addContainers(2, service4);

        console.log("🏢 Дата-центр створено!");
    }

    function createServerRacks() {
        // Створюємо 6 серверних стійок
        const positions = [
            [-4, 0, -3], [0, 0, -3], [4, 0, -3],
            [-4, 0, 3], [0, 0, 3], [4, 0, 3]
        ];

        positions.forEach(pos => {
            const rackGroup = new THREE.Group();
            
            // Основна стійка
            const rackGeometry = new THREE.BoxGeometry(1.5, 3, 1);
            const rackMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x2c2c2c,
                transparent: true,
                opacity: 0.9
            });
            const rack = new THREE.Mesh(rackGeometry, rackMaterial);
            rack.position.set(0, 1.5, 0);
            rack.castShadow = true;
            rackGroup.add(rack);

            // Додаємо світлові індикатори
            for (let i = 0; i < 6; i++) {
                const ledGeometry = new THREE.SphereGeometry(0.05, 8, 8);
                const ledMaterial = new THREE.MeshBasicMaterial({
                    color: Math.random() > 0.5 ? 0x00ff00 : 0xff3333,
                    transparent: true,
                    opacity: 0.8
                });
                const led = new THREE.Mesh(ledGeometry, ledMaterial);
                led.position.set(0.76, 0.5 + i * 0.4, Math.random() * 0.6 - 0.3);
                rackGroup.add(led);
            }

            rackGroup.position.set(pos[0], pos[1], pos[2]);
            datacenter.add(rackGroup);
        });
    }

    function createMicroservice(name, color, x, y, z) {
        const serviceGeometry = new THREE.BoxGeometry(1.2, 0.8, 1.2);
        const serviceMaterial = new THREE.MeshLambertMaterial({
            color: color,
            transparent: true,
            opacity: 0.7,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const serviceMesh = new THREE.Mesh(serviceGeometry, serviceMaterial);
        serviceMesh.position.set(x, y, z);
        serviceMesh.castShadow = true;
        
        // Зберігаємо дані в об'єкті
        serviceMesh.userData = { 
            name: name, 
            containers: [],
            basePosition: { x, y, z }
        };
        
        return serviceMesh;
    }

    function addContainers(count, microservice) {
        if (!microservice) {
            microservice = microservices[Math.floor(Math.random() * microservices.length)];
        }
        
        const serviceName = microservice.userData.name;
        console.log(`➕ Додаємо ${count} контейнер(ів) до сервісу "${serviceName}"`);
        
        for (let i = 0; i < count; i++) {
            const containerGeometry = new THREE.SphereGeometry(0.15, 12, 12);
            const containerMaterial = new THREE.MeshLambertMaterial({
                color: microservice.material.color,
                emissive: microservice.material.color,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.8
            });
            const container = new THREE.Mesh(containerGeometry, containerMaterial);

            // Розміщуємо контейнер навколо мікросервісу
            const containerCount = microservice.userData.containers.length;
            const radius = 1.2 + Math.floor(containerCount / 6) * 0.4;
            const angle = (containerCount % 6) * (Math.PI * 2 / 6);
            
            container.position.set(
                microservice.position.x + Math.cos(angle) * radius,
                microservice.position.y + Math.sin(containerCount * 0.5) * 0.3,
                microservice.position.z + Math.sin(angle) * radius
            );
            
            container.castShadow = true;
            container.userData = {
                service: microservice,
                orbitAngle: angle,
                orbitRadius: radius,
                initialY: container.position.y
            };
            
            microservice.userData.containers.push(container);
            containers.push(container);
            datacenter.add(container);
        }
    }

    // --- ML модель ---
    async function createAndTrainModel() {
        statusText.textContent = "🤖 Тренування ML-моделі...";
        
        try {
            let model = tf.sequential();
            model.add(tf.layers.lstm({ 
                units: 16, 
                inputShape: [10, 1],
                returnSequences: false
            }));
            model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
            model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
            
            model.compile({ 
                optimizer: tf.train.adam(0.001), 
                loss: 'meanSquaredError',
                metrics: ['mae']
            });

            // Генеруємо тренувальні дані
            const data = Array.from({length: 200}, (_, i) => {
                const t = i / 20;
                return Math.max(0, Math.min(1, 
                    Math.sin(t) * 0.3 + 
                    Math.sin(t * 3) * 0.2 + 
                    Math.random() * 0.1 + 0.5
                ));
            });

            const xs_data = [], ys_data = [];
            for (let i = 0; i < data.length - 10; i++) {
                xs_data.push(data.slice(i, i + 10));
                ys_data.push(data[i + 10]);
            }

            const xs = tf.tensor2d(xs_data);
            const ys = tf.tensor1d(ys_data);
            const xs_reshaped = xs.reshape([xs.shape[0], xs.shape[1], 1]);

            await model.fit(xs_reshaped, ys, { 
                epochs: 50, 
                batchSize: 16,
                verbose: 0
            });

            console.log("🎓 ML-модель успішно натренована!");
            
            // Очищуємо пам'ять
            xs.dispose(); 
            ys.dispose(); 
            xs_reshaped.dispose();
            
            mlModel = model;
            
        } catch (error) {
            console.error("❌ Помилка тренування ML моделі:", error);
            statusText.textContent = "❌ Помилка тренування ML моделі";
        }
    }

    async function predictLoad(sequence) {
        if (!mlModel || sequence.length !== 10) return null;
        
        return tf.tidy(() => {
            const input = tf.tensor2d([sequence]).reshape([1, 10, 1]);
            const prediction = mlModel.predict(input);
            return prediction.dataSync()[0];
        });
    }

    // --- Симуляція ---
    async function handleSimulation() {
        if (!simulationActive) return;

        simulationTime += 0.05;
        
        // Генеруємо реалістичне навантаження
        const baseLoad = Math.sin(simulationTime) * 0.4 + 0.5;
        const spikes = Math.sin(simulationTime * 3) * 0.2;
        const currentLoad = Math.max(0, Math.min(1, baseLoad + spikes));

        statusText.textContent = `📊 Навантаження: ${currentLoad.toFixed(3)}`;
        loadHistory.push(currentLoad);
        
        if (loadHistory.length > 10) { 
            loadHistory.shift(); 
        }

        if (loadHistory.length === 10 && mlModel) {
            try {
                const prediction = await predictLoad(loadHistory);
                if (prediction !== null) {
                    predictionText.textContent = `🔮 Прогноз: ${prediction.toFixed(3)}`;
                    
                    if (prediction > LOAD_THRESHOLD) {
                        const targetService = microservices[Math.floor(Math.random() * microservices.length)];
                        statusText.innerHTML = `🚨 Високе навантаження!<br>🔄 Автомасштабування: ${targetService.userData.name}`;
                        addContainers(1, targetService);
                        simulationTime += Math.PI; // Зміщуємо фазу для різноманітності
                    }
                }
            } catch (error) {
                console.error("❌ Помилка прогнозування:", error);
            }
        }
    }

    // --- Обробники подій ---
    function setupEventHandlers() {
        simButton.onclick = () => {
            simulationActive = !simulationActive;
            simButton.textContent = simulationActive ? "⏸️ Зупинити симуляцію" : "▶️ Симулювати навантаження";
            
            if (simulationActive) {
                console.log("🚀 Симуляція запущена");
            } else {
                console.log("⏸️ Симуляція зупинена");
            }
        };

        window.addEventListener('resize', onWindowResize);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // --- Анімація ---
    function animate() {
        requestAnimationFrame(animate);
        
        if (controls) {
            controls.update();
        }
        
        handleSimulation();
        
        // Анімація контейнерів
        containers.forEach((container, index) => {
            if (container.userData && container.userData.service) {
                // Обертання навколо сервісу
                container.userData.orbitAngle += 0.01;
                
                const service = container.userData.service;
                const radius = container.userData.orbitRadius;
                const angle = container.userData.orbitAngle;
                
                container.position.x = service.position.x + Math.cos(angle) * radius;
                container.position.z = service.position.z + Math.sin(angle) * radius;
                container.position.y = container.userData.initialY + Math.sin(simulationTime + index) * 0.1;
                
                // Обертання самого контейнера
                container.rotation.y += 0.02;
                container.rotation.x += 0.01;
            }
        });
        
        // Пульсація мікросервісів
        microservices.forEach((service, index) => {
            const pulse = Math.sin(simulationTime * 2 + index) * 0.1 + 1;
            service.scale.set(pulse, pulse, pulse);
            
            // Змінюємо емісивність на основі навантаження
            if (service.material && loadHistory.length > 0) {
                const currentLoad = loadHistory[loadHistory.length - 1] || 0;
                service.material.emissiveIntensity = 0.1 + currentLoad * 0.3;
            }
        });

        renderer.render(scene, camera);
    }

    // Запуск програми
    main();
};