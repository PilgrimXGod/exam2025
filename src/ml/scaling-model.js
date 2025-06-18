// Файл: src/ml/scaling-model.js (Версія без модулів)

// Створюємо глобальний об'єкт, якщо його ще немає
window.MLModel = window.MLModel || {};

(function(ML) { // Самоізолююча функція, щоб не забруднювати глобальний простір

    let model;
    const SEQUENCE_LENGTH = 10;

    function generateTrainingData() {
        // ... код функції залишається без змін ...
        const data = [];
        for (let i = 0; i < 200; i++) {
            const value = Math.sin(i / 15) * 0.5 + 0.5 + (Math.random() - 0.5) * 0.1;
            data.push(Math.max(0, Math.min(1, value)));
        }
        const xs_data = [];
        const ys_data = [];
        for (let i = 0; i < data.length - SEQUENCE_LENGTH; i++) {
            xs_data.push(data.slice(i, i + SEQUENCE_LENGTH));
            ys_data.push(data[i + SEQUENCE_LENGTH]);
        }
        return { xs: tf.tensor2d(xs_data), ys: tf.tensor1d(ys_data) };
    }

    // "Експортуємо" функцію, додаючи її до нашого глобального об'єкта
    ML.createAndTrainModel = async function() {
        console.log("Починаємо створення та тренування ML-моделі...");
        model = tf.sequential();
        model.add(tf.layers.lstm({ units: 16, inputShape: [SEQUENCE_LENGTH, 1] }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

        const { xs, ys } = generateTrainingData();
        const xs_reshaped = xs.reshape([xs.shape[0], xs.shape[1], 1]);

        await model.fit(xs_reshaped, ys, {
            epochs: 40,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(`Епоха ${epoch + 1}: Втрати = ${logs.loss.toFixed(4)}`);
                }
            }
        });

        console.log("ML-модель успішно натренована!");
        xs.dispose();
        ys.dispose();
        xs_reshaped.dispose();
        
        return model;
    }

    // "Експортуємо" другу функцію
    ML.predictLoad = async function(sequence) {
        if (!model) {
            throw new Error("Модель ще не натренована!");
        }
        if (sequence.length !== SEQUENCE_LENGTH) {
            return null;
        }
        return tf.tidy(() => {
            const input = tf.tensor2d([sequence]).reshape([1, SEQUENCE_LENGTH, 1]);
            const prediction = model.predict(input);
            return prediction.dataSync()[0];
        });
    }

})(window.MLModel); // Передаємо наш глобальний об'єкт у функцію