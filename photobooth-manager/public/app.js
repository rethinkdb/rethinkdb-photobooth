'use strict';

class PhotoBoothManager extends React.Component {
    // Set the initial state in the constructor
    constructor(props) {
        super(props)
        this.state = {
            socket: io.connect(),
            photos: []
        }
    }
    addPhoto(photo) {
        const new_photo = {id: photo.id, path: "/photos/" + photo.id, time: photo.time}
        // Make sure this photo hasn't been added before
        let matching = this.state.photos.findIndex(existing => existing.id == photo.id);
        if (matching < 0)
            this.setState({photos: [new_photo].concat(this.state.photos)});
    }
    componentDidMount() {
        // Open the Socket.IO connection
        const socket = this.state.socket;
        socket.on('photo added', (photo) => this.addPhoto(photo));

        socket.on('photo removed', (photo) =>  {
            // Find and remove the photo from our index
            let matching = this.state.photos.findIndex(existing => existing.id == photo.id);
            if (matching >= 0)
                this.setState(this.state.photos.splice(matching, 1));
        })

        // Get all the photos in the photobooth
        fetch("/photos")
            .then((output) => output.json())
            .then((response) => response.map((photo) => this.addPhoto(photo)));
    }
    render() {
        return(
            <div>
                <Index photos={this.state.photos} />
            </div>
        );
    }
}

class Index extends React.Component {
    render() {
        return(
            <section className="photo-index">
                <h1>ThinkerBooth HQ</h1>
                <ul className="photos">
                    {this.props.photos.map(
                        (photo) => <li key={photo.id}><Photo id={photo.id} img={photo.path} timestamp={photo.time}/></li>
                    )}
                </ul>
            </section>
        )
    }
}

class Photo extends React.Component {
    propTypes: {
        id: React.PropTypes.string,
        img: React.PropTypes.string,
        timestamp: React.PropTypes.string
    }

    constructor() {
        super();
        this.state = { removed: false }

        // Bind event handlers
        this.tweet = this.tweet.bind(this);
        this.remove = this.remove.bind(this);
    }

    // Tweet this photo
    tweet(event) {
        event.preventDefault();
        fetch(`/tweet/${this.props.id}`).then((response) => {
            console.log("Tweeted:", response);
        });
    }

    // Remove this photo
    remove(event) {
        event.preventDefault();
        fetch(`/photos/${this.props.id}`, { method: "DELETE"}).then((response) => {
            if (response.status == 200) {
                this.setState({removed: true});
            }
        });
    }

    render() {
        return(
            <section className={"photo" + (this.state.removed ? " removed" : "")}>
                <img src={this.props.img} />
                <h1>Taken {moment(this.props.timestamp).fromNow()}</h1>
                <div onClick={this.tweet}><a href="#">Tweet photo</a></div>
                <div onClick={this.remove}><a href="#">Remove photo</a></div>
            </section>
        )
    }
}

ReactDOM.render(<PhotoBoothManager />,document.getElementById('container'))
