import joblib
import pandas as pd
import numpy as np
from datetime import datetime
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CrimePredictor:
    def __init__(self, models_dir='models'):
        self.models_dir = os.path.abspath(models_dir)
        if not os.path.exists(self.models_dir):
            raise FileNotFoundError(f"Models directory not found: {self.models_dir}")
        self.models = self._load_models()

    def _load_models(self):
        try:
            models = {
                'crime_type_encoder': joblib.load(os.path.join(self.models_dir, 'crime_type_encoder.pkl')),
                'district_encoder': joblib.load(os.path.join(self.models_dir, 'district_encoder.pkl')),
                'svm_model': joblib.load(os.path.join(self.models_dir, 'svm_model.pkl')),
                'poisson_model': joblib.load(os.path.join(self.models_dir, 'poisson_model.pkl')),
                'kde_model': joblib.load(os.path.join(self.models_dir, 'kde_model.pkl')),
                'district_cluster_mapping': joblib.load(os.path.join(self.models_dir, 'district_cluster_mapping.pkl')),
                'cluster_crime_dist': joblib.load(os.path.join(self.models_dir, 'cluster_crime_distribution.pkl')),
                'crime_types': joblib.load(os.path.join(self.models_dir, 'crime_types.pkl'))
            }
            logger.info("All models loaded successfully")
            return models
        except Exception as e:
            logger.error(f"Failed to load ML models: {str(e)}")
            raise

    def preprocess_input(self, user_data):
        processed = user_data.copy()
        required_fields = ['Crime_Type', 'District', 'Date_Time', 'Latitude', 'Longitude']
        for field in required_fields:
            if field not in processed:
                raise ValueError(f"Missing required field: {field}")

        processed['Latitude'] = float(processed['Latitude'])
        processed['Longitude'] = float(processed['Longitude'])

        try:
            processed['Crime_Type_Encoded'] = self.models['crime_type_encoder'].transform([processed['Crime_Type']])[0]
            processed['District_Encoded'] = self.models['district_encoder'].transform([processed['District']])[0]
        except Exception as e:
            raise ValueError(f"Invalid category: {str(e)}")

        try:
            dt = datetime.strptime(processed['Date_Time'], '%Y-%m-%d %H:%M:%S')
            processed['Hour'] = dt.hour
            processed['Month'] = dt.month
        except ValueError:
            raise ValueError("Invalid datetime format. Use YYYY-MM-DD HH:MM:SS")

        processed['Arrest Status'] = 1 if str(processed.get('Arrest', 'false')).lower() == 'true' else 0
        processed['Domestic'] = 1 if str(processed.get('Domestic', 'false')).lower() == 'true' else 0

        return processed

    def predict(self, processed_data):
        results = {}
        logger.info("Starting predictions with data: %s", processed_data)

        # SVM Prediction
        svm_features = pd.DataFrame([[processed_data['Latitude'], processed_data['Longitude'],
                                      processed_data['Hour'], processed_data['Crime_Type_Encoded'],
                                      processed_data['District_Encoded'], processed_data['Arrest Status']]],
                                    columns=self.models['svm_model'].feature_names_in_)
        svm_risk = self.models['svm_model'].predict_proba(svm_features)[0][1]
        results['svm'] = {'high_risk': float(svm_risk)}
        logger.info(f"SVM prediction: {svm_risk}")

        # Poisson Prediction
        poisson_features = pd.DataFrame([[processed_data['Latitude'], processed_data['Longitude'],
                                          processed_data['Hour'], processed_data['Month'],
                                          processed_data['District_Encoded'], processed_data['Crime_Type_Encoded']]],
                                        columns=self.models['poisson_model'].feature_names_in_)
        poisson_count = self.models['poisson_model'].predict(poisson_features)[0]
        if poisson_count < 0:
            poisson_count = 0
        elif poisson_count < 1:
            poisson_count = 1
        results['poisson'] = {'prediction': int(poisson_count)}
        logger.info(f"Poisson prediction: {poisson_count}")

        # KDE Prediction
        kde_intensity = np.exp(
            self.models['kde_model'].score_samples([[processed_data['Latitude'], processed_data['Longitude']]])[0])
        results['kde'] = {'intensity': float(kde_intensity)}
        logger.info(f"KDE prediction: {kde_intensity}")

        # K-Means Prediction
        cluster = self.models['district_cluster_mapping'].get(processed_data['District'], -1)
        cluster_dist = self.models['cluster_crime_dist'].get(cluster, {t: 1.0/len(self.models['crime_types']) for t in self.models['crime_types']})
        if cluster == -1:
            logger.warning(f"District {processed_data['District']} not found in cluster mapping")
        results['kmeans'] = {
            'cluster': int(cluster),
            'crime_distribution': [cluster_dist.get(t, 0) for t in self.models['crime_types']]
        }
        logger.info(f"K-Means prediction - Cluster: {cluster}, Distribution: {results['kmeans']['crime_distribution']}")

        results['input_features'] = {
            'Latitude': processed_data['Latitude'],
            'Longitude': processed_data['Longitude']
        }

        return results