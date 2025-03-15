import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import './App.css';

function App() {
  // Updates every 5 seconds
  const updateInterval = 5000;
  const maxDataPoints = 120;

  const defaultCoins = [
    { id: 'bitcoin', name: 'Bitcoin', ticker: 'BTC' },
    { id: 'ethereum', name: 'Ethereum', ticker: 'ETH' },
    { id: 'solana', name: 'Solana', ticker: 'SOL' }
  ];

  const [coins, setCoins] = useState(defaultCoins);
  const [activeCoin, setActiveCoin] = useState(defaultCoins[0].id);
  const [priceData, setPriceData] = useState({}); // { coinId: { labels: [], data: [], error: false } }
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // Fetch the coin price from Coinbase API (spot price)
  const fetchPrice = (coin) => {
    const coinTicker = coin.ticker.toUpperCase();
    fetch(`https://api.coinbase.com/v2/prices/${coinTicker}-USD/spot`)
      .then(res => res.json())
      .then(data => {
        if (data && data.data && data.data.amount) {
          const price = parseFloat(data.data.amount);
          updatePriceData(coin.id, price);
        } else {
          updatePriceData(coin.id, null, true);
        }
      })
      .catch(err => {
        console.error(`Error fetching price for ${coin.id}:`, err);
        updatePriceData(coin.id, null, true);
      });
  };

  const updatePriceData = (coinId, price, error = false) => {
    setPriceData(prev => {
      const prevData = prev[coinId] || { labels: [], data: [] };
      const timeLabel = new Date().toLocaleTimeString();
      const newLabels = [...prevData.labels, timeLabel].slice(-maxDataPoints);
      const newData = error
        ? [...prevData.data, null].slice(-maxDataPoints)
        : [...prevData.data, price].slice(-maxDataPoints);
      return { ...prev, [coinId]: { labels: newLabels, data: newData, error } };
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      coins.forEach(coin => fetchPrice(coin));
    }, updateInterval);
    return () => clearInterval(interval);
  }, [coins]);

  useEffect(() => {
    coins.forEach(coin => fetchPrice(coin));
  }, []);

  // Search for coins using CoinGecko API (Coinbase doesn't provide a public search endpoint)
  useEffect(() => {
    if (!searchQuery) {
      setSuggestions([]);
      return;
    }
    fetch(`https://api.coingecko.com/api/v3/search?query=${searchQuery}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.coins && data.coins.length > 0) {
          const results = data.coins.map(coin => ({
            id: coin.id,
            name: coin.name,
            ticker: coin.symbol.toUpperCase()
          }));
          setSuggestions(results.slice(0, 5));
        } else {
          setSuggestions([{ notFound: true }]);
        }
      })
      .catch(err => {
        console.error("Error searching coins:", err);
        setSuggestions([{ notFound: true }]);
      });
  }, [searchQuery]);

  // Add a coin to the dashboard if not already added
  const addCoin = (coin) => {
    if (!coins.find(c => c.id === coin.id)) {
      setCoins(prev => [...prev, coin]);
    }
    setActiveCoin(coin.id);
    setSearchQuery('');
    setSuggestions([]);
  };

  return (
    <div className="container">
      <h1 className="header">Crypto Dashboard</h1>
      <div className="button-container">
        {coins.map(coin => (
          <button 
            key={coin.id} 
            className={activeCoin === coin.id ? 'active-button' : 'button'}
            onClick={() => setActiveCoin(coin.id)}
          >
            {coin.name}
          </button>
        ))}
      </div>
      <div className="search-container">
        <input 
          type="text" 
          placeholder="Search for a coin..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((suggestion, index) => (
              suggestion.notFound ? (
                <li key={index} className="suggestion-item">sorry, coin not found</li>
              ) : (
                <li 
                  key={suggestion.id} 
                  className="suggestion-item"
                  onClick={() => addCoin(suggestion)}
                >
                  {suggestion.name} ({suggestion.ticker})
                </li>
              )
            ))}
          </ul>
        )}
      </div>
      <div className="coin-display">
        {coins.map(coin => (
          <div 
            key={coin.id} 
            className="coin-panel" 
            style={{ display: activeCoin === coin.id ? 'block' : 'none' }}
          >
            <CoinPanel coin={coin} priceData={priceData[coin.id]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Component for displaying an individual coin’s price, live chart, and open/close prices using Coinbase Pro API
function CoinPanel({ coin, priceData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [ohlcData, setOhlcData] = useState([]);
  const [ohlcLoading, setOhlcLoading] = useState(true);
  const [ohlcAvailable, setOhlcAvailable] = useState(true);

  // Fetch historical OHLC data from Coinbase Pro API
  useEffect(() => {
    setOhlcLoading(true);
    const end = new Date();
    const start = new Date(end.getTime() - (10 * 24 * 60 * 60 * 1000)); // last 10 days
    const startISOString = start.toISOString();
    const endISOString = end.toISOString();
    // Coinbase Pro API requires product id in the format: BTC-USD, ETH-USD, etc.
    const productId = `${coin.ticker}-USD`;
    fetch(`https://api.exchange.coinbase.com/products/${productId}/candles?start=${startISOString}&end=${endISOString}&granularity=86400`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // Coinbase returns candles as [ time, low, high, open, close, volume ]
          // Sort in ascending order by time
          const sortedData = data.sort((a, b) => a[0] - b[0]);
          setOhlcData(sortedData);
          setOhlcAvailable(true);
        } else {
          setOhlcAvailable(false);
        }
        setOhlcLoading(false);
      })
      .catch(err => {
        console.error("Error fetching OHLC data:", err);
        setOhlcAvailable(false);
        setOhlcLoading(false);
      });
  }, [coin.ticker, coin.id]);

  // Set up the Chart.js line chart for live current price data
  useEffect(() => {
    if (canvasRef && canvasRef.current) {
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: priceData ? priceData.labels : [],
          datasets: [{
            label: `${coin.name} Price`,
            data: priceData ? priceData.data : [],
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            fill: false
          }]
        },
        options: {
          scales: {
            x: {
              display: true,
              title: { display: true, text: 'Time' }
            },
            y: {
              display: true,
              title: { display: true, text: 'Price in USD' },
              ticks: {
                stepSize: 10
              }
            }
          }
        }
      });
    }
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  // Update the chart whenever new price data arrives
  useEffect(() => {
    if (chartRef.current && priceData) {
      chartRef.current.data.labels = priceData.labels;
      chartRef.current.data.datasets[0].data = priceData.data;
      chartRef.current.update();
    }
  }, [priceData]);

  return (
    <div>
      <h2>{coin.name}</h2>
      <div className="price">
        {priceData && priceData.data.length > 0 && priceData.data[priceData.data.length - 1] !== null 
          ? `$${priceData.data[priceData.data.length - 1].toFixed(2)}`
          : "fetching price, please be patient"}
      </div>
      <canvas ref={canvasRef} width="300" height="150"></canvas>
      <div className="ohlc-data">
        <h3>Open/Close Prices (Last 10 Days)</h3>
        {ohlcLoading ? (
          <p>Loading historical data...</p>
        ) : ohlcAvailable ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Open (USD)</th>
                <th>Close (USD)</th>
              </tr>
            </thead>
            <tbody>
              {ohlcData.map(candle => {
                // Each candle is [ time, low, high, open, close, volume ]
                const [time, low, high, open, close] = candle;
                // Coinbase timestamps are in seconds
                const date = new Date(time * 1000).toLocaleDateString();
                return (
                  <tr key={time}>
                    <td>{date}</td>
                    <td>{open.toFixed(2)}</td>
                    <td>{close.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>Historical data not available</p>
        )}
      </div>
    </div>
  );
}

export default App;