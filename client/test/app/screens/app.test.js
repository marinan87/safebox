require('testdom')('<html><body></body></html>')

import React from 'react'
import ReactTestUtils from 'react-addons-test-utils'
import App from '../../../src/app/screens/app'
import Sidebar from '../../../src/app/screens/app/components/sidebar'

import * as chai from 'chai'
chai.should()

describe('App', () => {

  it('should render', () => {
    const renderer = ReactTestUtils.createRenderer();
    const component = renderer.render(<App/>);
    (component.type)
      .should
      .equal('div')
  })

  it('should contain sidebar', () => {
    const component = ReactTestUtils.renderIntoDocument(<App/>);
    const sidebars = ReactTestUtils.scryRenderedComponentsWithType(component, Sidebar);

    (sidebars)
      .should
      .have
      .lengthOf(1)
  })

})