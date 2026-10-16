from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Engine configuration supporting both Aiven MySQL and local SQLite
connect_args = {}
engine_kwargs = {
    "echo": False,
}
database_url = settings.DATABASE_URL

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine_kwargs["connect_args"] = connect_args
else:
    # Aiven provides SSL settings as URL query parameters. PyMySQL expects
    # TLS options in connect_args instead, so translate those settings here.
    url = make_url(settings.DATABASE_URL)
    query = dict(url.query)
    ssl_mode = query.pop("ssl-mode", query.pop("ssl_mode", None))
    if "mysql+pymysql" in url.drivername and ssl_mode:
        query.pop("ssl-ca", None)
        query.pop("ssl_ca", None)
        url = url.set(query=query)
        connect_args["ssl"] = {}
    else:
        url = url.set(query=query)
    # Use the cleaned URL. Keeping settings.DATABASE_URL here would pass
    # ssl-mode/ssl_mode through to PyMySQL and raise an unexpected-keyword error.
    database_url = url

    # Aiven MySQL pool management (handles SSL and timeouts gracefully)
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["connect_args"] = connect_args

engine = create_engine(database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
