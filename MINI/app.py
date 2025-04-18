import os
import re
from datetime import datetime, timezone
from urllib.parse import quote
from flask import Flask, request, jsonify, render_template, redirect, url_for, flash, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import logging
from models import db, User, PredictionHistory, ContactQuery
from ml_utils import CrimePredictor

# Initialize Flask app
app = Flask(__name__)

# Load environment variables
load_dotenv()

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fallback-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crime_prediction.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Initialize ML component
predictor = CrimePredictor(models_dir=os.path.join(os.path.dirname(__file__), 'models'))

# Configure logging
logging.basicConfig(level=logging.INFO)
app_logger = logging.getLogger(__name__)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        try:
            data = request.form.to_dict()
            if not re.match(r"[^@]+@[^@]+\.[^@]+", data['email']):
                flash('Invalid email format', 'danger')
                return redirect(url_for('signup'))

            if User.query.filter_by(email=data['email'].lower()).first():
                flash('Email already registered', 'danger')
                return redirect(url_for('signup'))

            user = User(
                fullname=data['fullname'],
                email=data['email'].lower(),
                password_hash=generate_password_hash(data['password']),
                affiliation=data['affiliation']
            )
            db.session.add(user)
            db.session.commit()
            flash('Registration successful! Please login', 'success')
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            flash(f'Registration failed: {str(e)}', 'danger')
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        try:
            user = User.query.filter_by(email=request.form['email'].lower()).first()
            if user and check_password_hash(user.password_hash, request.form['password']):
                login_user(user)
                user.last_login = datetime.now(timezone.utc)
                db.session.commit()
                return redirect(url_for('dashboard'))
            flash('Invalid email or password', 'danger')
        except Exception as e:
            flash(f'Login error: {str(e)}', 'danger')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html',
                          user_name=current_user.fullname,
                          user_affiliation=current_user.affiliation,
                          crime_types=predictor.models['crime_types'],
                          results=None)  # Pass None if no prediction yet

@app.route('/predict', methods=['POST'])
@login_required
def predict():
    try:
        data = request.form.to_dict()
        date_str = data['date_range']
        time_str = data['time']
        data['Date_Time'] = f"{date_str} {time_str}:00"
        data['Crime_Type'] = data.pop('crime_type')
        data['District'] = data.pop('district')
        data['Latitude'] = data['latitude']
        data['Longitude'] = data['longitude']
        data['Arrest'] = data.get('arrest', 'False')
        data['Domestic'] = data.get('domestic', 'False')

        processed = predictor.preprocess_input(data)
        results = predictor.predict(processed)
        app_logger.info(f"Prediction results: {results}")

        new_prediction = PredictionHistory(
            user_id=current_user.id,
            input_features=data,
            model_used='full_model',
            prediction_result=results
        )
        db.session.add(new_prediction)
        db.session.commit()

        return render_template('dashboard.html',
                              results=results,
                              user_name=current_user.fullname,
                              user_affiliation=current_user.affiliation,
                              crime_types=predictor.models['crime_types'])
    except Exception as e:
        app_logger.error(f"Prediction error: {str(e)}")
        flash(f'Prediction failed: {str(e)}', 'danger')
        return render_template('dashboard.html',
                              user_name=current_user.fullname,
                              user_affiliation=current_user.affiliation,
                              crime_types=predictor.models['crime_types'])

@app.route('/contact', methods=['POST'])
def contact():
    try:
        data = request.form.to_dict()
        contact = ContactQuery(
            name=data['name'],
            email=data['email'],
            message=data['message']
        )
        db.session.add(contact)
        db.session.commit()
        flash('Your message has been submitted', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Failed to submit message', 'danger')
    return redirect(url_for('index'))

@app.errorhandler(500)
def internal_error(error):
    return render_template('500.html'), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)