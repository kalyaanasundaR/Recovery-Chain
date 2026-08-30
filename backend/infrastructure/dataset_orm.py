from sqlalchemy import Column, String, Integer, DateTime, JSON, Enum
from infrastructure.db import Base
from datetime import datetime, timezone
import enum

class DatasetStatus(str, enum.Enum):
    PENDING = "PENDING"
    UPLOADED = "UPLOADED"
    PROFILING = "PROFILING"
    MAPPING_REVIEW = "MAPPING_REVIEW"
    READY_FOR_ANALYSIS = "READY_FOR_ANALYSIS"
    ANALYZING = "ANALYZING"
    COMPLETED = "COMPLETED"
    ML_READY = "ML_READY"
    TRAINING = "TRAINING"
    TRAINED = "TRAINED"
    FAILED = "FAILED"

class DatasetMetadataModel(Base):
    __tablename__ = "datasets"

    dataset_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    upload_timestamp = Column(DateTime, nullable=False)
    status = Column(Enum(DatasetStatus), nullable=False, default=DatasetStatus.PENDING)
    error_message = Column(String, nullable=True)
    
    # General Stats
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    duplicate_row_count = Column(Integer, nullable=True)
    total_missing_values = Column(Integer, nullable=True)
    
    # Detailed Analysis (Stored as JSON for flexibility)
    columns_profile = Column(JSON, nullable=True)
    data_quality_report = Column(JSON, nullable=True)
    temporal_analysis = Column(JSON, nullable=True)
    training_suitability = Column(JSON, nullable=True)
    recoverchain_signals = Column(JSON, nullable=True)
    target_detection = Column(JSON, nullable=True)
    leakage_detection = Column(JSON, nullable=True)
