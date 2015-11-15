'use strict';

class PhotoBooth extends React.Component {
    // Set the initial state in the constructor
    constructor(props) {
        super(props)
        this.state = {
            socket: io.connect(),
            photos: []
        }
    }
    addPhoto(photo) {
        const new_photo = {id: photo.id, path: "/image/" + photo.id}
        this.setState({photos: [new_photo].concat(this.state.photos)});
    }
    componentDidMount() {
        // Open the Socket.IO connection
        const socket = this.state.socket;
        socket.on('photo', (photo) =>  {
            console.log('New photo:', photo);
            this.addPhoto(photo);
        })

        // Fetch the latest images from the backend
        fetch("/recent")
            .then((output) => output.json())
            .then((response) => {
                console.log("Output:", response);
                response.reverse().map((photo) => this.addPhoto(photo));
            });
    }
    render() {
        return(
            <div>
                <Camera />
                <Filmstrip photos={this.state.photos} />
            </div>
        );
    }
}

class Camera extends React.Component {
    // Set the initial state in the constructor
    constructor(props) {
        super(props)
        this.state = {
            liveCamera: true,
            cameraWidth: 0,
            cameraHeight: 0
        }
    }
    componentDidMount() {
        // Open a live stream from the webcam
        navigator.webkitGetUserMedia({video: true},
            (stream) => { this.setState({webcamStream: window.URL.createObjectURL(stream)}); },
            (err) => { console.log('Failed to get video stream.'); }
        );

    }
    // Takes a photo using the webcam and shows the snapshot
    snapPhoto() {
        // Resize the canvas dimensions to fit the video stream
        const snapshot = this.refs.snapshot;
        const camera = this.refs.camera;
        const width = this.refs.live.clientWidth;
        const height = this.refs.live.clientHeight;
        camera.height = snapshot.height = height;
        camera.width = snapshot.width = width;

        // Maps a frame from the webcam onto an invisible canvas element, so we can grab an image
        const ctx = snapshot.getContext("2d");
        ctx.drawImage(this.refs.live, 0, 0, width, height);

        // Add a Thinker sticker to the canvas
        const thinker = new Image();
        thinker.onload = () => {
            ctx.drawImage(thinker, 0, 280, 133, 200);
        }
        thinker.src = '/thinker.png'

        // Show the snapshot
        this.setState({liveCamera: false});
    }
    // Return to the live camera view
    showLiveCamera() {
        this.setState({liveCamera: true});
    }
    // Push the photo to our backend (and RethinkDB), which will then be tweeted
    tweetPhoto() {
        // Take the binary blob off the canvas and upload it to the backend server
        this.refs.snapshot.toBlob((blob) => {
            const formData = new FormData();
            formData.append("file", blob, "image.jpg");

            PhotoUtils.uploadFile("/image/upload", formData,
                (ev) => console.log("Upload complete:", ev.target.response),
                (ev) => console.log("Upload in progress:", ev.loaded, ev.total),
            "image/jpg");
        });
    }
    render() {
        // Set CSS styles according to our current state (live camera or snapshot)
        const showingLiveCamera = { zIndex: this.state.liveCamera ? '1' : '-1' }
        const showingSnapshot = { zIndex: this.state.liveCamera ? '-1' : '1' }
        // By default, show the live camera controls, or flip to the snapshot controls
        const showingControls = ({live=true} = {}) => {
            const showing = live ? this.state.liveCamera : !this.state.liveCamera;
            return {
                marginLeft: showing ? '-325px' : 0,
                visibility: showing ? 'hidden' : 'visible',
            }
        }
        return(
            <div className="camera-body">
                <div ref="camera" className="camera">
                    <video 
                        ref="live" 
                        src={this.state.webcamStream} 
                        autoPlay
                        style={showingLiveCamera}></video>
                    <canvas
                        ref="snapshot" 
                        style={showingSnapshot}
                        className="snapshot"></canvas>
                </div>
                <div className="camera-controls">
                    <div className="snapshot-controls" style={showingControls()}>
                        <button 
                            onClick={this.showLiveCamera.bind(this)}
                            className="new-photo">New photo</button>
                        <button 
                            onClick={this.tweetPhoto.bind(this)}
                            className="tweet-photo">Tweet photo!</button>
                    </div>
                    <div className="live-controls" style={showingControls({live: false})}>
                        <button 
                            onClick={this.snapPhoto.bind(this)}
                            className="snap-photo">Snap a photo!</button>
                    </div>
                </div>
            </div>
        );
    }
}

class Filmstrip extends React.Component {
    render() {
        return(
            <div className="recent-photos">
                <h1>Recently tweeted photos (@RethinkDBHQ):</h1>
                <div className="filmstrip-container">
                    <div className="filmstrip">
                        {this.props.photos.map(
                            (photo) => <Photo key={photo.id} img={photo.path} />
                        )}
                    </div>
                </div>
            </div>
        )
    }
}

class Photo extends React.Component {
    propTypes: {
        img: React.PropTypes.string,
    }
    render() {
        return <img className="photo" src={this.props.img} />
    }
}

class PhotoUtils {
    static uploadFile(path, form, cbcomplete, cbprogress) {
        const req = new XMLHttpRequest();
        req.onload = cbcomplete;
        req.upload.onprogress = cbprogress;

        req.open("POST", path, true);
        req.send(form);
    }
}

ReactDOM.render(<PhotoBooth />,document.getElementById('container'))
