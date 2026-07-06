from datetime import date
from .winner_genome_service import WinnerGenomeService
from .missed_alpha_service import MissedAlphaService
from .pattern_discovery import PatternDiscoveryService
from .factor_discovery_engine import FactorDiscoveryEngine

class AlphaDiscoveryEngine:
    """
    Level 10.5A - Alpha Discovery Engine
    Runs daily independent of retraining. 
    Pipeline: Market Close -> Winner Genome -> Missed Alpha -> Pattern Discovery -> Factors
    """
    def __init__(self, db_conn):
        self.db = db_conn
        self.genome_service = WinnerGenomeService(db_conn)
        self.missed_alpha_service = MissedAlphaService(db_conn)
        self.pattern_discovery = PatternDiscoveryService(db_conn)
        self.factor_discovery = FactorDiscoveryEngine(db_conn)

    def run_daily_pipeline(self, target_date: date):
        print(f"[Level 10.5] Starting Alpha Discovery Engine for {target_date}")
        
        # 1. Update Winner Genome
        self.genome_service.execute_daily_snapshot(target_date)
        
        # 2. Update Missed Alpha Archive
        self.missed_alpha_service.identify_and_archive_missed_alpha(target_date)
        
        # 3. Pattern Discovery (UMAP + HDBSCAN)
        clusters_found = self.pattern_discovery.execute_clustering(target_date)
        
        # 4. Generate Candidate Factors
        if clusters_found > 0:
            self.factor_discovery.generate_candidate_factors(target_date)
            
        print(f"[Level 10.5] Pipeline complete for {target_date}.")

if __name__ == "__main__":
    import sqlite3
    conn = sqlite3.connect(':memory:')
    engine = AlphaDiscoveryEngine(conn)
    # engine.run_daily_pipeline(date.today())
    print("Alpha Discovery Engine Scaffolded.")
